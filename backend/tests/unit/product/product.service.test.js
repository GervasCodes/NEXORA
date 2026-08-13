jest.mock("../../../src/modules/product/product.repository");
jest.mock("../../../src/modules/category/category.repository");
jest.mock("../../../src/utils/cloudinaryUpload");
jest.mock("../../../src/modules/subscription/subscription.service");
// Phase RF5: getOrSet calls straight through to fetchFn so this file's
// existing repository-level assertions keep working unchanged; bumpVersion
// is asserted directly on every write path below.
jest.mock("../../../src/utils/cache", () => ({
    getOrSet: jest.fn((namespace, key, fetchFn) => fetchFn()),
    bumpVersion: jest.fn().mockResolvedValue(undefined)
}));

const productRepository = require("../../../src/modules/product/product.repository");
const categoryRepository = require("../../../src/modules/category/category.repository");
const { uploadToCloudinary } = require("../../../src/utils/cloudinaryUpload");
const subscriptionService = require("../../../src/modules/subscription/subscription.service");
const cache = require("../../../src/utils/cache");
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

// Phase A4 - Products & Services List UI/UX (seller's own product list:
// search/category/status filters, pagination, bulk activate/deactivate).
describe("product.service.getMyProducts (Phase A4)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("clamps page/limit, scopes to the seller, and forwards filters", async () => {
        productRepository.findAllBySeller.mockResolvedValue({ rows: [{ id: 1 }], total: 1 });

        const result = await productService.getMyProducts(9, { page: "3", limit: "1000", search: "mug", category_id: "4", status: "active" });

        expect(productRepository.findAllBySeller).toHaveBeenCalledWith({
            sellerId: 9, search: "mug", categoryId: "4", status: "active", page: 3, limit: 50
        });
        expect(result).toEqual({
            products: [{ id: 1 }],
            pagination: { page: 3, limit: 50, total: 1, totalPages: 1 }
        });
    });

    it("defaults page/limit and nulls out unset filters when no query is given", async () => {
        productRepository.findAllBySeller.mockResolvedValue({ rows: [], total: 0 });

        await productService.getMyProducts(9);

        expect(productRepository.findAllBySeller).toHaveBeenCalledWith({
            sellerId: 9, search: null, categoryId: null, status: null, page: 1, limit: 20
        });
    });
});

describe("product.service.bulkSetProductActiveBySeller (Phase A4)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("rejects when no valid ids are given", async () => {
        await expect(productService.bulkSetProductActiveBySeller(9, [], true)).rejects.toThrow("No products selected");
        await expect(productService.bulkSetProductActiveBySeller(9, ["nope"], true)).rejects.toThrow("No products selected");
    });

    it("dedupes ids and delegates ownership enforcement to the repository's UPDATE, bumping both cache namespaces", async () => {
        const result = await productService.bulkSetProductActiveBySeller(9, [3, 3, 4], false);

        expect(productRepository.setActiveBulkBySeller).toHaveBeenCalledWith(9, [3, 4], false);
        expect(result).toEqual({ updated: 2 });
        expect(cache.bumpVersion).toHaveBeenCalledWith("products");
        expect(cache.bumpVersion).toHaveBeenCalledWith("categories");
    });
});

// Phase RF5 - Redis Caching Layer.
describe("product.service Phase RF5 caching", () => {
    beforeEach(() => jest.clearAllMocks());

    it("listProducts reads through the products cache namespace with the parsed filters as the key", async () => {
        productRepository.findAll.mockResolvedValue({ rows: [{ id: 1 }], total: 1 });

        const result = await productService.listProducts({ page: "2", category_id: "5", search: "mug" });

        expect(cache.getOrSet).toHaveBeenCalledWith(
            "products",
            expect.objectContaining({ fn: "listProducts", categoryId: "5", search: "mug", page: 2 }),
            expect.any(Function)
        );
        expect(result.products).toEqual([{ id: 1 }]);
    });

    it("listFilterSellers and listFilterRegions both read through the products cache namespace", async () => {
        productRepository.findFilterSellers.mockResolvedValue([]);
        productRepository.findFilterRegions.mockResolvedValue([]);

        await productService.listFilterSellers({ category_id: "5" });
        await productService.listFilterRegions({ category_id: "5" });

        expect(cache.getOrSet).toHaveBeenCalledWith(
            "products",
            { fn: "listFilterSellers", categoryId: "5" },
            expect.any(Function)
        );
        expect(cache.getOrSet).toHaveBeenCalledWith(
            "products",
            { fn: "listFilterRegions", categoryId: "5" },
            expect.any(Function)
        );
    });

    it("createProduct bumps both the products and categories cache namespaces", async () => {
        categoryRepository.findById.mockResolvedValue({ id: 5, is_active: true });
        subscriptionService.canCreateListing.mockResolvedValue({ allowed: true });
        productRepository.create.mockResolvedValue(42);

        await productService.createProduct(1, { category_id: 5, name: "Widget", price: 10 });

        expect(cache.bumpVersion).toHaveBeenCalledWith("products");
        expect(cache.bumpVersion).toHaveBeenCalledWith("categories");
    });

    it("updateProduct bumps only the products namespace when the category doesn't change", async () => {
        productRepository.findById.mockResolvedValue({ id: 5, seller_id: 1, category_id: 5 });

        await productService.updateProduct(1, 5, { name: "New name" });

        expect(cache.bumpVersion).toHaveBeenCalledWith("products");
        expect(cache.bumpVersion).not.toHaveBeenCalledWith("categories");
    });

    it("updateProduct bumps both namespaces when the product moves to a different category", async () => {
        productRepository.findById.mockResolvedValue({ id: 5, seller_id: 1, category_id: 5 });
        categoryRepository.findById.mockResolvedValue({ id: 8, is_active: true });

        await productService.updateProduct(1, 5, { category_id: 8 });

        expect(cache.bumpVersion).toHaveBeenCalledWith("products");
        expect(cache.bumpVersion).toHaveBeenCalledWith("categories");
    });

    it("setProductActiveBySeller bumps both the products and categories cache namespaces", async () => {
        productRepository.findById.mockResolvedValue({ id: 5, seller_id: 1 });

        await productService.setProductActiveBySeller(1, 5, false);

        expect(cache.bumpVersion).toHaveBeenCalledWith("products");
        expect(cache.bumpVersion).toHaveBeenCalledWith("categories");
    });
});
