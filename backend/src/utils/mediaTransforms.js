// Phase 5: video edits are saved as metadata and applied by Cloudinary
// transformations at delivery time - no re-encoding on the device or on our
// server. Photo edits are baked in on the device (canvas) before upload, so
// for photos this module only whitelists the descriptive metadata.

const num = (v, fallback = null) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};
const round2 = (n) => Math.round(n * 100) / 100;

// Clamp client-supplied video edits against the real duration.
// Returns { trimStart, trimEnd, mute, coverTime } (seconds; trimEnd null = to the end).
exports.normalizeVideoEdits = (raw, duration) => {
    const edits = raw && typeof raw === "object" ? raw : {};
    const dur = Math.max(0, num(duration, 0));
    let start = Math.min(Math.max(0, num(edits.trimStart, 0)), dur);
    let end = edits.trimEnd == null ? null : Math.min(Math.max(0, num(edits.trimEnd, dur)), dur);
    if (end !== null && end - start < 0.5) {
        // Too short to be a real clip: ignore the trim rather than fail the upload.
        start = 0;
        end = null;
    }
    if (end !== null && end >= dur - 0.05) end = null;
    const windowEnd = end === null ? dur : end;
    const cover = Math.min(Math.max(start, num(edits.coverTime, start)), Math.max(start, windowEnd));
    return {
        trimStart: round2(start),
        trimEnd: end === null ? null : round2(end),
        mute: Boolean(edits.mute),
        coverTime: round2(cover)
    };
};

const insertAfterUpload = (url, transformation) =>
    transformation ? String(url).replace("/upload/", `/upload/${transformation}/`) : url;

exports.buildVideoUrl = (secureUrl, edits) => {
    const parts = [];
    if (edits.trimStart > 0) parts.push(`so_${edits.trimStart}`);
    if (edits.trimEnd !== null) parts.push(`eo_${edits.trimEnd}`);
    const trim = parts.join(",");
    const url = insertAfterUpload(secureUrl, trim);
    // Audio removal is a separate transformation component.
    return edits.mute ? insertAfterUpload(url, "e_volume:mute").replace(/\/upload\/e_volume:mute\/(.+?)\/(v\d+\/)/, "/upload/$1,e_volume:mute/$2") : url;
};

// A JPEG still of the chosen cover frame (start offset is in the ORIGINAL
// video's timeline, so no trim is applied here).
exports.buildPosterUrl = (secureUrl, coverTime) =>
    insertAfterUpload(secureUrl, `so_${coverTime}`).replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");

const FILTERS = new Set(["none", "warm", "cool", "mono", "vivid", "fade"]);
const ASPECTS = new Set(["original", "1:1", "4:5", "16:9"]);

exports.sanitizePhotoEdits = (raw) => {
    const e = raw && typeof raw === "object" ? raw : {};
    const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, num(v, d)));
    return {
        aspect: ASPECTS.has(e.aspect) ? e.aspect : "original",
        rotate: [0, 90, 180, 270].includes(num(e.rotate)) ? num(e.rotate) : 0,
        brightness: clamp(e.brightness, -100, 100, 0),
        contrast: clamp(e.contrast, -100, 100, 0),
        saturation: clamp(e.saturation, -100, 100, 0),
        filter: FILTERS.has(e.filter) ? e.filter : "none"
    };
};
