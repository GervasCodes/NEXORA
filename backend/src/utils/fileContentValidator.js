// Server-side file-content validation (Phase 2 - Security Hardening).
//
// Every upload middleware (upload/uploadVideo/uploadAudio/uploadDocument/
// uploadChatAttachment.middleware.js) already restricts uploads by
// `file.mimetype` via multer's `fileFilter` - but that value comes from
// the Content-Type of the multipart part, which is whatever the
// uploading CLIENT claims it is. A request crafted with curl/Postman (or
// a compromised/malicious client) can set that header to "image/jpeg"
// while the actual bytes are anything at all - an HTML file with a
// <script> tag, a renamed executable, a polyglot file, etc. multer's
// fileFilter never looks at the bytes themselves, so none of that was
// caught before this (flagged as a known ⚠️ gap in
// docs/SECURITY_REVIEW_CHECKLIST.md #3 - "trusts the client-reported
// mimetype").
//
// This module sniffs the actual first bytes of the uploaded content (the
// file's "magic number"/signature) and classifies it into a small set of
// categories, independent of whatever the client claimed. The upload
// middlewares use this AFTER multer has buffered the file (memoryStorage
// - see each middleware's `storage`), rejecting anything whose real
// content doesn't match one of the categories that middleware allows.
//
// This intentionally does NOT replace the existing fileFilter mimetype
// check - it's a second, independent layer. A request that lies about
// its mimetype is now rejected either way; one that tells the truth
// passes both.
const logger = require("./logger");

const matchesBytes = (buffer, offset, bytes) => {
    if (buffer.length < offset + bytes.length) {
        return false;
    }
    for (let i = 0; i < bytes.length; i += 1) {
        if (bytes[i] !== null && buffer[offset + i] !== bytes[i]) {
            return false;
        }
    }
    return true;
};

// RIFF-container formats (WEBP/WAV/AVI) all share the same 12-byte
// header shape - 4 bytes "RIFF", 4 bytes size, 4 bytes a format tag -
// and only differ in that trailing tag.
const riffFormatTag = (buffer) => {
    if (!matchesBytes(buffer, 0, [0x52, 0x49, 0x46, 0x46])) {
        return null;
    }
    return buffer.slice(8, 12).toString("ascii");
};

// ISO-base-media-file-format ("ftyp box") formats - MP4/MOV/M4A/M4B all
// share this container and only differ in the "major brand" 4 bytes
// right after the box header, so distinguishing video from
// audio-in-an-mp4-box needs an explicit brand check rather than a single
// fixed byte sequence.
const isoBmffBrand = (buffer) => {
    if (!matchesBytes(buffer, 4, [0x66, 0x74, 0x79, 0x70])) {
        return null;
    }
    return buffer.slice(8, 12).toString("ascii").trim();
};

const AUDIO_ISO_BRANDS = new Set(["M4A", "M4B", "M4P"]);

// Returns { category, ext } for the first recognized signature, or null
// if the content doesn't match anything this module knows how to
// recognize. Order matters where formats share a container (RIFF/ftyp
// handled above; everything else is a simple fixed-offset byte match).
const classify = (buffer) => {
    if (!buffer || buffer.length < 4) {
        return null;
    }

    // --- Images ---------------------------------------------------------
    if (matchesBytes(buffer, 0, [0xff, 0xd8, 0xff])) {
        return { category: "image", ext: "jpg" };
    }
    if (matchesBytes(buffer, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return { category: "image", ext: "png" };
    }
    if (matchesBytes(buffer, 0, [0x47, 0x49, 0x46, 0x38])) {
        return { category: "image", ext: "gif" };
    }
    if (matchesBytes(buffer, 0, [0x42, 0x4d])) {
        return { category: "image", ext: "bmp" };
    }

    const riffTag = riffFormatTag(buffer);
    if (riffTag === "WEBP") {
        return { category: "image", ext: "webp" };
    }
    if (riffTag === "WAVE") {
        return { category: "audio", ext: "wav" };
    }
    if (riffTag === "AVI ") {
        return { category: "video", ext: "avi" };
    }

    // --- ISO-BMFF (MP4/MOV/M4A) -----------------------------------------
    const brand = isoBmffBrand(buffer);
    if (brand) {
        return AUDIO_ISO_BRANDS.has(brand)
            ? { category: "audio", ext: "m4a" }
            : { category: "video", ext: "mp4" };
    }

    // --- Other video ------------------------------------------------------
    if (matchesBytes(buffer, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
        return { category: "video", ext: "webm" }; // also matches .mkv (same container family)
    }

    // --- Audio ------------------------------------------------------------
    if (matchesBytes(buffer, 0, [0x49, 0x44, 0x33])) {
        return { category: "audio", ext: "mp3" }; // ID3-tagged
    }
    if (
        matchesBytes(buffer, 0, [0xff, 0xfb]) ||
        matchesBytes(buffer, 0, [0xff, 0xf3]) ||
        matchesBytes(buffer, 0, [0xff, 0xf2])
    ) {
        return { category: "audio", ext: "mp3" }; // bare MPEG frame sync, no ID3 tag
    }
    if (matchesBytes(buffer, 0, [0x4f, 0x67, 0x67, 0x53])) {
        return { category: "audio", ext: "ogg" };
    }

    // --- Documents ----------------------------------------------------------
    if (matchesBytes(buffer, 0, [0x25, 0x50, 0x44, 0x46])) {
        return { category: "document", ext: "pdf" };
    }
    if (matchesBytes(buffer, 0, [0x50, 0x4b, 0x03, 0x04])) {
        // .docx/.xlsx/.pptx are zip containers - a plain .zip matches
        // this too, but nothing here allows raw zip uploads anyway, so
        // that's not a meaningfully wider hole than intended.
        return { category: "document", ext: "zip-based-office" };
    }
    if (matchesBytes(buffer, 0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
        return { category: "document", ext: "ole-office" }; // legacy .doc/.xls
    }

    return null;
};

exports.classify = classify;

// Plain text (.txt) has no magic number at all, so it can only ever be
// validated heuristically: real text shouldn't contain a NUL byte, and
// should decode as valid UTF-8 without producing the replacement
// character. This is intentionally only used for files whose declared
// mimetype is exactly "text/plain" - see fileContentValidation.middleware.js.
exports.looksLikePlainText = (buffer) => {
    if (!buffer || buffer.length === 0) {
        return false;
    }
    const sample = buffer.slice(0, 8000);
    if (sample.includes(0x00)) {
        return false;
    }
    return !sample.toString("utf8").includes("\uFFFD");
};

exports.logRejection = (context) => {
    logger.warn(context, "[upload] rejected file - content does not match an allowed type for this upload");
};
