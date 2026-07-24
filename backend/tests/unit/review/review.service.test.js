jest.mock("../../../src/modules/review/review.repository");
jest.mock("../../../src/modules/product/product.repository");
jest.mock("../../../src/utils/cloudinaryUpload");

const reviewRepository = require("../../../src/modules/review/review.repository");
const productRepository = require("../../../src/modules/product/product.repository");
const { uploadToCloudinary } = require("../../../src/utils/cloudinaryUpload");
const reviewService = require("../../../src/modules/review/review.service");

// Phase 5D: getStoreReviews is the store-page sibling of the existing
// getProductReviews (untested before this phase) - same
// reviews+summary-in-parallel shape, but paginated since a store's
// review count (unlike one product's) is unbounded.
// Phase 6C added a third parallel call (rating breakdown) and photo
// attachment, so every test here now also stubs
// getSellerRatingBreakdown/findPhotosByReviewIds.
describe("review.service.getStoreReviews", () => {
    beforeEach(() => {
        reviewRepository.getSellerRatingBreakdown.mockResolvedValue([]);
        reviewRepository.findPhotosByReviewIds.mockResolvedValue([]);
    });

    it("returns paginated reviews with a rounded average rating", async () => {
        reviewRepository.findBySeller.mockResolvedValue([
            { id: 1, rating: 5, comment: "Great!", first_name: "Asha", last_name: "M" }
        ]);
        reviewRepository.getSellerRatingSummary.mockResolvedValue({
            review_count: 18,
            average_rating: "4.5555"
        });

        const result = await reviewService.getStoreReviews(42, 1);

        expect(reviewRepository.findBySeller).toHaveBeenCalledWith(42, 10, 0, undefined);
        expect(reviewRepository.getSellerRatingSummary).toHaveBeenCalledWith(42);
        expect(result).toEqual({
            reviews: [{ id: 1, rating: 5, comment: "Great!", first_name: "Asha", last_name: "M", photos: [] }],
            average_rating: 4.6,
            review_count: 18,
            page: 1,
            totalPages: 2,
            rating_breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        });
    });

    it("offsets by page and rounds totalPages up", async () => {
        reviewRepository.findBySeller.mockResolvedValue([]);
        reviewRepository.getSellerRatingSummary.mockResolvedValue({
            review_count: 25,
            average_rating: "3"
        });

        const result = await reviewService.getStoreReviews(42, 3);

        expect(reviewRepository.findBySeller).toHaveBeenCalledWith(42, 10, 20, undefined);
        expect(result.page).toBe(3);
        expect(result.totalPages).toBe(3);
    });

    it("defaults to page 1 and never goes below it", async () => {
        reviewRepository.findBySeller.mockResolvedValue([]);
        reviewRepository.getSellerRatingSummary.mockResolvedValue({
            review_count: 0,
            average_rating: null
        });

        const result = await reviewService.getStoreReviews(42, 0);

        expect(reviewRepository.findBySeller).toHaveBeenCalledWith(42, 10, 0, undefined);
        expect(result.page).toBe(1);
        expect(result.average_rating).toBeNull();
        expect(result.totalPages).toBe(1);
    });

    it("passes a sort param through to the repository", async () => {
        reviewRepository.findBySeller.mockResolvedValue([]);
        reviewRepository.getSellerRatingSummary.mockResolvedValue({
            review_count: 0,
            average_rating: null
        });

        await reviewService.getStoreReviews(42, 1, "highest");

        expect(reviewRepository.findBySeller).toHaveBeenCalledWith(42, 10, 0, "highest");
    });
});

// Phase 6C
describe("review.service.getProductReviews", () => {
    it("builds a fixed 5-1 rating breakdown and attaches photos per review", async () => {
        reviewRepository.findByProduct.mockResolvedValue([
            { id: 1, rating: 5, comment: "Love it" },
            { id: 2, rating: 3, comment: "It's ok" }
        ]);
        reviewRepository.getProductRatingSummary.mockResolvedValue({
            review_count: 2,
            average_rating: "4"
        });
        reviewRepository.getProductRatingBreakdown.mockResolvedValue([
            { rating: 5, count: 1 },
            { rating: 3, count: 1 }
        ]);
        reviewRepository.findPhotosByReviewIds.mockResolvedValue([
            { id: 9, review_id: 1, photo_url: "https://cdn/photo9.jpg" }
        ]);

        const result = await reviewService.getProductReviews(7, "highest");

        expect(reviewRepository.findByProduct).toHaveBeenCalledWith(7, "highest");
        expect(reviewRepository.findPhotosByReviewIds).toHaveBeenCalledWith([1, 2]);
        expect(result.reviews).toEqual([
            { id: 1, rating: 5, comment: "Love it", photos: [{ id: 9, photo_url: "https://cdn/photo9.jpg" }] },
            { id: 2, rating: 3, comment: "It's ok", photos: [] }
        ]);
        expect(result.rating_breakdown).toEqual({ 5: 1, 4: 0, 3: 1, 2: 0, 1: 0 });
    });
});

describe("review.service.addReviewPhoto", () => {
    it("rejects a photo on a review that isn't the buyer's own", async () => {
        reviewRepository.findById.mockResolvedValue({ id: 5, buyer_id: 99, product_id: 1 });

        await expect(reviewService.addReviewPhoto(1, 5, { buffer: Buffer.from("x") }))
            .rejects.toThrow("Review not found");

        expect(uploadToCloudinary).not.toHaveBeenCalled();
    });

    it("enforces the per-review photo cap", async () => {
        reviewRepository.findById.mockResolvedValue({ id: 5, buyer_id: 1, product_id: 1 });
        reviewRepository.countExistingPhotos.mockResolvedValue(5);

        await expect(reviewService.addReviewPhoto(1, 5, { buffer: Buffer.from("x") }))
            .rejects.toThrow("A review can have at most 5 photos");

        expect(uploadToCloudinary).not.toHaveBeenCalled();
    });

    it("uploads to the reviews folder and stores the resulting URL", async () => {
        reviewRepository.findById.mockResolvedValue({ id: 5, buyer_id: 1, product_id: 1 });
        reviewRepository.countExistingPhotos.mockResolvedValue(1);
        uploadToCloudinary.mockResolvedValue({ secure_url: "https://cdn/photo.jpg" });

        const result = await reviewService.addReviewPhoto(1, 5, { buffer: Buffer.from("x") });

        expect(uploadToCloudinary).toHaveBeenCalledWith(expect.any(Buffer), "reviews");
        expect(reviewRepository.addPhoto).toHaveBeenCalledWith(5, "https://cdn/photo.jpg", 1);
        expect(result).toEqual({ photoUrl: "https://cdn/photo.jpg" });
    });
});

describe("review.service.replyToReview", () => {
    it("rejects a reply on a review for another seller's product", async () => {
        reviewRepository.findById.mockResolvedValue({ id: 5, product_id: 1 });
        productRepository.findById.mockResolvedValue({ id: 1, seller_id: 99 });

        await expect(reviewService.replyToReview(1, 5, "Thanks!"))
            .rejects.toThrow("Review not found");

        expect(reviewRepository.setSellerReply).not.toHaveBeenCalled();
    });

    it("saves the reply when the seller owns the reviewed product", async () => {
        reviewRepository.findById.mockResolvedValue({ id: 5, product_id: 1 });
        productRepository.findById.mockResolvedValue({ id: 1, seller_id: 1 });

        await reviewService.replyToReview(1, 5, "Thanks for the feedback!");

        expect(reviewRepository.setSellerReply).toHaveBeenCalledWith(5, "Thanks for the feedback!");
    });
});
