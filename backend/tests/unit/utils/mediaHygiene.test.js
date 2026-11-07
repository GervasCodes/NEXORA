const sharp = require("sharp");
const { publicIdFromUrl } = require("../../../src/utils/cloudinaryUpload");
const { stripImageMetadata } = require("../../../src/utils/imageSanitize");
const limitConcurrency = require("../../../src/middleware/limitConcurrency.middleware");
const validator = require("../../../src/utils/fileContentValidator");

jest.mock("../../../src/config/cloudinary", () => ({ uploader: {} }));

describe("publicIdFromUrl", () => {
    it("extracts folder/name without version and extension", () => {
        expect(publicIdFromUrl("https://res.cloudinary.com/demo/image/upload/v1700000000/products/abc123.jpg")).toBe("products/abc123");
        expect(publicIdFromUrl("https://res.cloudinary.com/demo/video/upload/v12/products/videos/clip.mp4")).toBe("products/videos/clip");
    });
    it("ignores delivery transformations and works without a version", () => {
        expect(publicIdFromUrl("https://res.cloudinary.com/d/video/upload/so_2,eo_10,e_volume:mute/v1/products/media/5/videos/x.mp4")).toBe("products/media/5/videos/x");
        expect(publicIdFromUrl("https://res.cloudinary.com/x/video/upload/products/media/5/videos/x")).toBe("products/media/5/videos/x");
    });
    it("returns null for non-Cloudinary or malformed URLs", () => {
        expect(publicIdFromUrl("https://example.com/a.jpg")).toBeNull();
        expect(publicIdFromUrl("")).toBeNull();
    });
});

describe("stripImageMetadata", () => {
    it("removes EXIF (including GPS) from a JPEG", async () => {
        const withExif = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#f00" } })
            .jpeg()
            .withExif({ IFD0: { Copyright: "secret" } })
            .toBuffer();
        expect((await sharp(withExif).metadata()).exif).toBeDefined();
        const clean = await stripImageMetadata(withExif);
        expect((await sharp(clean).metadata()).exif).toBeUndefined();
    });
    it("passes unrecognised bytes through unchanged", async () => {
        const junk = Buffer.from("not an image");
        expect(await stripImageMetadata(junk)).toBe(junk);
    });
});

describe("limitConcurrency", () => {
    const makeRes = () => {
        const handlers = {};
        return { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn(), on: (e, f) => { handlers[e] = f; }, fire: (e) => handlers[e]() };
    };
    it("allows up to max in flight, rejects the next with 503, and frees a slot on finish", () => {
        const mw = limitConcurrency(2);
        const a = makeRes(), b = makeRes(), c = makeRes(), d = makeRes();
        const next = jest.fn();
        mw({}, a, next); mw({}, b, next); mw({}, c, next);
        expect(next).toHaveBeenCalledTimes(2);
        expect(c.status).toHaveBeenCalledWith(503);
        a.fire("finish");
        a.fire("close"); // double release must not free two slots
        mw({}, d, next);
        expect(next).toHaveBeenCalledTimes(3);
        mw({}, makeRes(), next);
        expect(next).toHaveBeenCalledTimes(3);
    });
});

describe("fileContentValidator HEIC/AVIF", () => {
    const ftyp = (brand) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftyp"), Buffer.from(brand), Buffer.alloc(12)]);
    it.each(["heic", "mif1", "avif"])("treats %s as an image, not video", (brand) => {
        expect(validator.classify(ftyp(brand)).category).toBe("image");
    });
    it("still treats isom/mp4 as video", () => {
        expect(validator.classify(ftyp("isom")).category).toBe("video");
    });
});
