import { describe, it, expect } from "vitest";
import { pickFeedMedia } from "../../src/utils/feedMedia";

describe("pickFeedMedia", () => {
    it("prefers a video from the product, then a fetched one, then the image", () => {
        const product = { image_url: "img.jpg", videos: [{ video_url: "a.mp4" }] };
        expect(pickFeedMedia(product, "b.mp4")).toEqual({ type: "video", src: "a.mp4", poster: "img.jpg" });
        expect(pickFeedMedia({ image_url: "img.jpg" }, "b.mp4")).toEqual({ type: "video", src: "b.mp4", poster: "img.jpg" });
        expect(pickFeedMedia({ image_url: "img.jpg" }, null)).toEqual({ type: "image", src: "img.jpg" });
    });

    it("returns none when there is no media at all", () => {
        expect(pickFeedMedia({}, undefined)).toEqual({ type: "none" });
    });
});
