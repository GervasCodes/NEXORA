import { describe, it, expect } from "vitest";
import { checkMediaFile, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "../../src/utils/mediaLimits";

const file = (name, type, size) => ({ name, type, size });

describe("checkMediaFile", () => {
    it("accepts a normal photo and video", () => {
        expect(checkMediaFile(file("a.jpg", "image/jpeg", 1000), "image")).toBeNull();
        expect(checkMediaFile(file("a.mp4", "video/mp4", 1000), "video")).toBeNull();
    });
    it("accepts HEIC even when the browser reports no mime type", () => {
        expect(checkMediaFile(file("IMG_1.HEIC", "", 1000), "image")).toBeNull();
    });
    it("rejects wrong types and oversize files with translatable keys", () => {
        expect(checkMediaFile(file("a.mp3", "audio/mpeg", 10), "video").key).toBe("media.notVideo");
        expect(checkMediaFile(file("a.pdf", "application/pdf", 10), "image").key).toBe("media.notImage");
        expect(checkMediaFile(file("a.jpg", "image/jpeg", MAX_IMAGE_BYTES + 1), "image").key).toBe("media.tooLarge");
        expect(checkMediaFile(file("a.mp4", "video/mp4", MAX_VIDEO_BYTES + 1), "video").params.max).toBe(50);
    });
});
