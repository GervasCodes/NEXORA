jest.mock("../../../src/modules/product/product.repository");
jest.mock("../../../src/modules/product/productMedia.repository");
jest.mock("../../../src/utils/cloudinaryUpload", () => ({
    deleteFromCloudinary: jest.fn().mockResolvedValue(true),
    publicIdFromUrl: jest.fn((u) => (u ? "pid" : null))
}));
jest.mock("../../../src/utils/malwareScan", () => ({ scanBuffer: jest.fn() }));
jest.mock("../../../src/utils/cache", () => ({ bumpVersion: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../src/config/cloudinary", () => ({
    utils: { api_sign_request: jest.fn(() => "sig") },
    api: { resource: jest.fn() }
}));
const mockConn = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn() };
jest.mock("../../../src/config/db", () => ({ getConnection: jest.fn(async () => mockConn), query: jest.fn() }));

const cloudinary = require("../../../src/config/cloudinary");
const productRepository = require("../../../src/modules/product/product.repository");
const mediaRepository = require("../../../src/modules/product/productMedia.repository");
const { deleteFromCloudinary } = require("../../../src/utils/cloudinaryUpload");
const svc = require("../../../src/modules/product/productMedia.service");

beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "key";
    process.env.CLOUDINARY_API_SECRET = "secret";
    delete process.env.CLAMAV_HOST;
    productRepository.findById.mockResolvedValue({ id: 5, seller_id: 1 });
    mediaRepository.countByKind.mockResolvedValue({ image: 0, video: 0 });
    mediaRepository.findByPublicId.mockResolvedValue(undefined);
    mediaRepository.nextPosition.mockResolvedValue(0);
    mediaRepository.insert.mockResolvedValue(42);
    mediaRepository.findById.mockResolvedValue({ id: 42 });
    mockConn.query.mockImplementation(async (sql) => (/MAX\(display_order\)/.test(sql) ? [[{ nextOrder: 3 }]] : [{ insertId: 77 }]));
});

describe("signUpload", () => {
    it("signs a folder- and format-restricted upload for the owner", async () => {
        const out = await svc.signUpload(1, 5, "video");
        expect(out.params.folder).toBe("products/media/5/videos");
        expect(out.params.allowed_formats).toContain("mp4");
        expect(out.signature).toBe("sig");
        expect(out.maxDurationS).toBe(60);
    });
    it("refuses a different seller's product", async () => {
        await expect(svc.signUpload(2, 5, "image")).rejects.toMatchObject({ status: 404 });
    });
    it("refuses once the cap is reached", async () => {
        mediaRepository.countByKind.mockResolvedValue({ image: 10, video: 0 });
        await expect(svc.signUpload(1, 5, "image")).rejects.toThrow("at most 10 photos");
    });
    it("reports 503 when Cloudinary is not configured", async () => {
        delete process.env.CLOUDINARY_API_SECRET;
        await expect(svc.signUpload(1, 5, "image")).rejects.toMatchObject({ status: 503 });
    });
});

describe("registerMedia", () => {
    const folder = "products/media/5/videos";
    it("rejects a public_id outside this product's folder", async () => {
        await expect(svc.registerMedia(1, 5, { kind: "video", publicId: "products/media/9/videos/x" }))
            .rejects.toThrow("not uploaded for this product");
    });
    it("verifies on Cloudinary, applies trim/mute via transformation URLs and mirrors to the legacy table", async () => {
        cloudinary.api.resource.mockResolvedValue({
            secure_url: `https://res.cloudinary.com/demo/video/upload/v1/${folder}/x.mp4`,
            bytes: 1000, format: "mp4", duration: 30, width: 720, height: 1280
        });
        await svc.registerMedia(1, 5, { kind: "video", publicId: `${folder}/x`, edits: { trimStart: 2, trimEnd: 10, mute: true, coverTime: 4 } });
        const row = mediaRepository.insert.mock.calls[0][0];
        expect(row.url).toContain("so_2,eo_10,e_volume:mute");
        expect(row.posterUrl).toMatch(/so_4.*\.jpg$/);
        expect(row.legacyId).toBe(77);
        const legacyInsert = mockConn.query.mock.calls.find(([sql]) => /INSERT INTO product_videos/.test(sql));
        expect(legacyInsert[1]).toEqual([5, row.url, 3]);
        expect(mockConn.commit).toHaveBeenCalled();
    });
    it("deletes and rejects a too-long video", async () => {
        cloudinary.api.resource.mockResolvedValue({
            secure_url: `https://res.cloudinary.com/demo/video/upload/v1/${folder}/x.mp4`,
            bytes: 1000, format: "mp4", duration: 120
        });
        await expect(svc.registerMedia(1, 5, { kind: "video", publicId: `${folder}/x` })).rejects.toThrow("at most 60 seconds");
        expect(deleteFromCloudinary).toHaveBeenCalled();
        expect(mediaRepository.insert).not.toHaveBeenCalled();
    });
    it("deletes and rejects an oversize or disallowed file", async () => {
        cloudinary.api.resource.mockResolvedValue({ secure_url: "https://res.cloudinary.com/demo/image/upload/v1/products/media/5/images/a.exe", bytes: 99, format: "exe" });
        await expect(svc.registerMedia(1, 5, { kind: "image", publicId: "products/media/5/images/a" })).rejects.toThrow("not allowed");
    });
    it("is idempotent for an already-registered public_id", async () => {
        mediaRepository.findByPublicId.mockResolvedValue({ id: 9 });
        await expect(svc.registerMedia(1, 5, { kind: "image", publicId: "products/media/5/images/a" })).resolves.toEqual({ id: 9 });
        expect(cloudinary.api.resource).not.toHaveBeenCalled();
    });
    it("makes the first photo the cover", async () => {
        cloudinary.api.resource.mockResolvedValue({ secure_url: "https://res.cloudinary.com/demo/image/upload/v1/products/media/5/images/a.jpg", bytes: 10, format: "jpg", width: 10, height: 10 });
        await svc.registerMedia(1, 5, { kind: "image", publicId: "products/media/5/images/a" });
        expect(mediaRepository.insert.mock.calls[0][0].isCover).toBe(true);
    });
});

describe("reorderMedia", () => {
    const items = [
        { id: 1, kind: "image", legacy_id: 11, is_cover: true },
        { id: 2, kind: "video", legacy_id: 21, is_cover: false },
        { id: 3, kind: "image", legacy_id: 12, is_cover: false }
    ];
    beforeEach(() => mediaRepository.list.mockResolvedValue(items));
    it("rejects a list that omits or repeats items", async () => {
        await expect(svc.reorderMedia(1, 5, [1, 2], null)).rejects.toThrow("exactly once");
        await expect(svc.reorderMedia(1, 5, [1, 1, 3], null)).rejects.toThrow("exactly once");
    });
    it("applies one transaction and keeps an image as cover", async () => {
        await svc.reorderMedia(1, 5, [3, 2, 1], 3);
        expect(mediaRepository.applyOrder).toHaveBeenCalledWith(mockConn, 5, expect.any(Array), 3);
        expect(mockConn.commit).toHaveBeenCalled();
    });
    it("falls back to the first image when the chosen cover is a video", async () => {
        await svc.reorderMedia(1, 5, [2, 3, 1], 2);
        expect(mediaRepository.applyOrder.mock.calls[0][3]).toBe(3);
    });
    it("rolls back on failure", async () => {
        mediaRepository.applyOrder.mockRejectedValueOnce(new Error("boom"));
        await expect(svc.reorderMedia(1, 5, [1, 2, 3], 1)).rejects.toThrow("boom");
        expect(mockConn.rollback).toHaveBeenCalled();
    });
});

describe("deleteMedia", () => {
    it("removes the legacy mirror and the cloud asset", async () => {
        mediaRepository.findById.mockResolvedValue({ id: 3, kind: "image", legacy_id: 12, is_cover: false, public_id: "products/media/5/images/a", url: "u" });
        await svc.deleteMedia(1, 5, 3);
        expect(mockConn.query.mock.calls.some(([sql]) => /DELETE FROM product_images/.test(sql))).toBe(true);
        expect(deleteFromCloudinary).toHaveBeenCalledWith(expect.stringContaining("products/media/5/images/a"), "image");
    });
    it("404s for unknown media", async () => {
        mediaRepository.findById.mockResolvedValue(undefined);
        await expect(svc.deleteMedia(1, 5, 99)).rejects.toMatchObject({ status: 404 });
    });
});
