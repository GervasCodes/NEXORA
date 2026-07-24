jest.mock("../../../src/modules/product/product.repository");
jest.mock("../../../src/utils/cloudinaryUpload");

const productRepository = require("../../../src/modules/product/product.repository");
const { uploadToCloudinary } = require("../../../src/utils/cloudinaryUpload");
const productService = require("../../../src/modules/product/product.service");

// Phase 6A - Product Videos. addProductVideo mirrors the pre-existing
// (previously untested) addProductImage: same ownership check, but with
// its own per-product cap since video is far more storage/bandwidth
// expensive than a photo.
describe("product.service.addProductVideo", () => {
    beforeEach(() => jest.clearAllMocks());

    const file = { buffer: Buffer.from("fake-video") };

    it("rejects when the product doesn't belong to this seller", async () => {
        productRepository.findById.mockResolvedValue({ id: 5, seller_id: 99 });

        await expect(productService.addProductVideo(1, 5, file))
            .rejects.toThrow("Product not found");

        expect(uploadToCloudinary).not.toHaveBeenCalled();
    });

    it("rejects when the product doesn't exist at all", async () => {
        productRepository.findById.mockResolvedValue(undefined);

        await expect(productService.addProductVideo(1, 5, file))
            .rejects.toThrow("Product not found");
    });

    it("uploads to Cloudinary as a video resource and stores the URL", async () => {
        productRepository.findById.mockResolvedValue({ id: 5, seller_id: 1 });
        productRepository.countExistingVideos.mockResolvedValue(1);
        uploadToCloudinary.mockResolvedValue({ secure_url: "https://cdn/video.mp4" });

        const result = await productService.addProductVideo(1, 5, file);

        expect(uploadToCloudinary).toHaveBeenCalledWith(file.buffer, "products/videos", "video");
        expect(productRepository.addProductVideo).toHaveBeenCalledWith(5, "https://cdn/video.mp4", 1);
        expect(result).toEqual({ videoUrl: "https://cdn/video.mp4" });
    });

    it("rejects once the product already has the maximum number of videos", async () => {
        productRepository.findById.mockResolvedValue({ id: 5, seller_id: 1 });
        productRepository.countExistingVideos.mockResolvedValue(3);

        await expect(productService.addProductVideo(1, 5, file))
            .rejects.toThrow("A product can have at most 3 videos");

        expect(uploadToCloudinary).not.toHaveBeenCalled();
        expect(productRepository.addProductVideo).not.toHaveBeenCalled();
    });
});

describe("product.service.addProductAudio", () => {
    beforeEach(() => jest.clearAllMocks());

    const file = { buffer: Buffer.from("fake-audio") };

    it("rejects when the product doesn't belong to this seller", async () => {
        productRepository.findById.mockResolvedValue({ id: 5, seller_id: 99 });

        await expect(productService.addProductAudio(1, 5, file))
            .rejects.toThrow("Product not found");

        expect(uploadToCloudinary).not.toHaveBeenCalled();
    });

    it("uploads to Cloudinary as a video-pipeline resource and stores the URL", async () => {
        productRepository.findById.mockResolvedValue({ id: 5, seller_id: 1 });
        productRepository.countExistingAudio.mockResolvedValue(0);
        uploadToCloudinary.mockResolvedValue({ secure_url: "https://cdn/clip.mp3" });

        const result = await productService.addProductAudio(1, 5, file);

        expect(uploadToCloudinary).toHaveBeenCalledWith(file.buffer, "products/audio", "video");
        expect(productRepository.addProductAudio).toHaveBeenCalledWith(5, "https://cdn/clip.mp3", 0);
        expect(result).toEqual({ audioUrl: "https://cdn/clip.mp3" });
    });

    it("rejects once the product already has the maximum number of audio clips", async () => {
        productRepository.findById.mockResolvedValue({ id: 5, seller_id: 1 });
        productRepository.countExistingAudio.mockResolvedValue(3);

        await expect(productService.addProductAudio(1, 5, file))
            .rejects.toThrow("A product can have at most 3 audio clips");

        expect(uploadToCloudinary).not.toHaveBeenCalled();
        expect(productRepository.addProductAudio).not.toHaveBeenCalled();
    });
});

describe("product.service.getProductBySlug", () => {
    beforeEach(() => jest.clearAllMocks());

    it("includes images, videos, and audio alongside the product", async () => {
        productRepository.findBySlug.mockResolvedValue({ id: 7, name: "Widget" });
        productRepository.findImagesByProductId.mockResolvedValue([{ id: 1, image_url: "img" }]);
        productRepository.findVideosByProductId.mockResolvedValue([{ id: 2, video_url: "vid" }]);
        productRepository.findAudioByProductId.mockResolvedValue([{ id: 3, audio_url: "aud" }]);

        const result = await productService.getProductBySlug("widget");

        expect(productRepository.findImagesByProductId).toHaveBeenCalledWith(7);
        expect(productRepository.findVideosByProductId).toHaveBeenCalledWith(7);
        expect(productRepository.findAudioByProductId).toHaveBeenCalledWith(7);
        expect(result).toEqual({
            id: 7,
            name: "Widget",
            images: [{ id: 1, image_url: "img" }],
            videos: [{ id: 2, video_url: "vid" }],
            audio: [{ id: 3, audio_url: "aud" }]
        });
    });

    it("throws when no product matches the slug", async () => {
        productRepository.findBySlug.mockResolvedValue(undefined);

        await expect(productService.getProductBySlug("missing")).rejects.toThrow("Product not found");
    });
});
