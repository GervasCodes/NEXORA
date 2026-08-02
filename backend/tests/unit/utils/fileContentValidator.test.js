const { classify, looksLikePlainText } = require("../../../src/utils/fileContentValidator");

describe("fileContentValidator.classify", () => {
    it("recognizes a JPEG by its magic bytes", () => {
        const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
        expect(classify(buf)).toEqual({ category: "image", ext: "jpg" });
    });

    it("recognizes a PNG by its magic bytes", () => {
        const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
        expect(classify(buf)).toEqual({ category: "image", ext: "png" });
    });

    it("recognizes a GIF by its magic bytes", () => {
        const buf = Buffer.from("GIF89a", "ascii");
        expect(classify(buf)).toEqual({ category: "image", ext: "gif" });
    });

    it("recognizes a WEBP (RIFF....WEBP) and distinguishes it from WAV/AVI sharing the same RIFF header", () => {
        const webp = Buffer.concat([
            Buffer.from("RIFF", "ascii"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP", "ascii")
        ]);
        expect(classify(webp)).toEqual({ category: "image", ext: "webp" });

        const wav = Buffer.concat([
            Buffer.from("RIFF", "ascii"), Buffer.from([0, 0, 0, 0]), Buffer.from("WAVE", "ascii")
        ]);
        expect(classify(wav)).toEqual({ category: "audio", ext: "wav" });

        const avi = Buffer.concat([
            Buffer.from("RIFF", "ascii"), Buffer.from([0, 0, 0, 0]), Buffer.from("AVI ", "ascii")
        ]);
        expect(classify(avi)).toEqual({ category: "video", ext: "avi" });
    });

    it("recognizes an MP4 (ISO-BMFF ftyp box, non-audio brand) as video", () => {
        const mp4 = Buffer.concat([
            Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftyp", "ascii"), Buffer.from("isom", "ascii")
        ]);
        expect(classify(mp4)).toEqual({ category: "video", ext: "mp4" });
    });

    it("distinguishes an M4A (ISO-BMFF ftyp box, audio brand) from an MP4 sharing the same container", () => {
        const m4a = Buffer.concat([
            Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftyp", "ascii"), Buffer.from("M4A ", "ascii")
        ]);
        expect(classify(m4a)).toEqual({ category: "audio", ext: "m4a" });
    });

    it("recognizes a WebM/Matroska EBML header as video", () => {
        const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00]);
        expect(classify(webm)).toEqual({ category: "video", ext: "webm" });
    });

    it("recognizes MP3 both with an ID3 tag and as a bare frame sync", () => {
        expect(classify(Buffer.from([0x49, 0x44, 0x33, 0x03]))).toEqual({ category: "audio", ext: "mp3" });
        expect(classify(Buffer.from([0xff, 0xfb, 0x90, 0x00]))).toEqual({ category: "audio", ext: "mp3" });
    });

    it("recognizes an OGG stream", () => {
        expect(classify(Buffer.from("OggS", "ascii"))).toEqual({ category: "audio", ext: "ogg" });
    });

    it("recognizes a PDF", () => {
        expect(classify(Buffer.from("%PDF-1.7", "ascii"))).toEqual({ category: "document", ext: "pdf" });
    });

    it("recognizes a zip-based office document (docx/xlsx/pptx container)", () => {
        expect(classify(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toEqual({ category: "document", ext: "zip-based-office" });
    });

    it("recognizes a legacy OLE-based office document (.doc/.xls)", () => {
        expect(classify(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toEqual({ category: "document", ext: "ole-office" });
    });

    it("returns null for content that doesn't match any known signature (e.g. a renamed executable/script)", () => {
        expect(classify(Buffer.from("<script>alert(1)</script>", "ascii"))).toBeNull();
        expect(classify(Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toBeNull(); // MZ - Windows PE header
    });

    it("returns null for a buffer too short to contain any signature", () => {
        expect(classify(Buffer.from([0x01]))).toBeNull();
        expect(classify(Buffer.alloc(0))).toBeNull();
    });

    it("returns null for a null/undefined buffer rather than throwing", () => {
        expect(classify(null)).toBeNull();
        expect(classify(undefined)).toBeNull();
    });
});

describe("fileContentValidator.looksLikePlainText", () => {
    it("accepts real UTF-8 text", () => {
        expect(looksLikePlainText(Buffer.from("Hello, this is a normal chat attachment note.", "utf8"))).toBe(true);
    });

    it("rejects content containing a NUL byte", () => {
        expect(looksLikePlainText(Buffer.from([0x48, 0x65, 0x00, 0x6c, 0x6f]))).toBe(false);
    });

    it("rejects binary content that doesn't decode as valid UTF-8", () => {
        expect(looksLikePlainText(Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02, 0x80, 0x81]))).toBe(false);
    });

    it("rejects an empty buffer", () => {
        expect(looksLikePlainText(Buffer.alloc(0))).toBe(false);
    });
});
