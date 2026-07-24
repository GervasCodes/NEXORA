const reviewRepository = require("./review.repository");
const productRepository = require("../product/product.repository");
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");

// Phase 6C: turns the flat [{rating, count}, ...] rows from
// getProductRatingBreakdown/getSellerRatingBreakdown into a fixed
// {5: n, 4: n, 3: n, 2: n, 1: n} shape so the frontend bar chart never
// has to handle a missing star rating (e.g. zero 2-star reviews) as a
// special case.
const buildRatingBreakdown = (rows) => {
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    rows.forEach((row) => {
        breakdown[row.rating] = row.count;
    });
    return breakdown;
};

// Batches review_photos onto a list of reviews in one extra query,
// same shape reviewRepository.findPhotosByReviewIds was written for.
// Reviews come back with a `photos` array (possibly empty) instead of
// nothing, so the frontend never has to special-case "no photos" vs.
// "photos not loaded".
const attachPhotos = async (reviews) => {
    const reviewIds = reviews.map((r) => r.id);
    const photos = await reviewRepository.findPhotosByReviewIds(reviewIds);

    const photosByReview = {};
    photos.forEach((photo) => {
        if (!photosByReview[photo.review_id]) photosByReview[photo.review_id] = [];
        photosByReview[photo.review_id].push({ id: photo.id, photo_url: photo.photo_url });
    });

    return reviews.map((review) => ({
        ...review,
        photos: photosByReview[review.id] || []
    }));
};

exports.createReview = async (buyerId, productId, rating, comment) => {
    const eligible = await reviewRepository.hasDeliveredPurchase(buyerId, productId);

    if (!eligible) {
        throw new Error("You can only review products from delivered orders");
    }

    const existing = await reviewRepository.findByBuyerAndProduct(buyerId, productId);

    if (existing) {
        throw new Error("You've already reviewed this product. You can edit your review instead");
    }

    const reviewId = await reviewRepository.create(buyerId, productId, rating, comment);

    return { reviewId };
};

exports.updateReview = async (reviewId, buyerId, rating, comment) => {
    const review = await reviewRepository.findById(reviewId);

    if (!review || review.buyer_id !== buyerId) {
        throw new Error("Review not found");
    }

    await reviewRepository.update(reviewId, rating, comment);
};

exports.deleteReview = async (reviewId, buyerId) => {
    const review = await reviewRepository.findById(reviewId);

    if (!review || review.buyer_id !== buyerId) {
        throw new Error("Review not found");
    }

    await reviewRepository.remove(reviewId);
};

exports.getProductReviews = async (productId, sortBy) => {
    const [reviews, summary, breakdownRows] = await Promise.all([
        reviewRepository.findByProduct(productId, sortBy),
        reviewRepository.getProductRatingSummary(productId),
        reviewRepository.getProductRatingBreakdown(productId)
    ]);

    return {
        reviews: await attachPhotos(reviews),
        average_rating: summary.average_rating
            ? Number(Number(summary.average_rating).toFixed(1))
            : null,
        review_count: summary.review_count,
        rating_breakdown: buildRatingBreakdown(breakdownRows)
    };
};

const STORE_REVIEWS_PAGE_SIZE = 10;

// Phase 5D: paginated, since (unlike a single product) a store's review
// count is unbounded - same offset-pagination shape product.service.js's
// findAll response already uses (pagination.total/totalPages), so the
// store page's "Load more" can follow ProductGrid's existing pattern
// instead of inventing a new one.
exports.getStoreReviews = async (sellerId, page = 1, sortBy) => {
    const currentPage = Math.max(1, page);
    const offset = (currentPage - 1) * STORE_REVIEWS_PAGE_SIZE;

    const [reviews, summary, breakdownRows] = await Promise.all([
        reviewRepository.findBySeller(sellerId, STORE_REVIEWS_PAGE_SIZE, offset, sortBy),
        reviewRepository.getSellerRatingSummary(sellerId),
        reviewRepository.getSellerRatingBreakdown(sellerId)
    ]);

    const reviewCount = summary.review_count || 0;

    return {
        reviews: await attachPhotos(reviews),
        average_rating: summary.average_rating
            ? Number(Number(summary.average_rating).toFixed(1))
            : null,
        review_count: reviewCount,
        page: currentPage,
        totalPages: Math.max(1, Math.ceil(reviewCount / STORE_REVIEWS_PAGE_SIZE)),
        rating_breakdown: buildRatingBreakdown(breakdownRows)
    };
};

// Phase 6C - buyers can attach photos to their own review, same
// ownership-then-cap-then-upload shape as product.service.js's
// addProductVideo/addProductAudio.
const MAX_PHOTOS_PER_REVIEW = 5;

exports.addReviewPhoto = async (buyerId, reviewId, file) => {
    const review = await reviewRepository.findById(reviewId);

    if (!review || review.buyer_id !== buyerId) {
        throw new Error("Review not found");
    }

    const existingCount = await reviewRepository.countExistingPhotos(reviewId);

    if (existingCount >= MAX_PHOTOS_PER_REVIEW) {
        throw new Error(`A review can have at most ${MAX_PHOTOS_PER_REVIEW} photos`);
    }

    const result = await uploadToCloudinary(file.buffer, "reviews");

    await reviewRepository.addPhoto(reviewId, result.secure_url, existingCount);

    return { photoUrl: result.secure_url };
};

// Phase 6C - a seller can reply once (editable) to any review left on
// one of their own products. Ownership runs through products.seller_id,
// same join reasoning findBySeller/getSellerRatingSummary already use,
// via productRepository (already imported by wishlist.service.js the
// same cross-module way) rather than duplicating a seller_id lookup
// query in this module.
exports.replyToReview = async (sellerId, reviewId, replyText) => {
    const review = await reviewRepository.findById(reviewId);

    if (!review) {
        throw new Error("Review not found");
    }

    const product = await productRepository.findById(review.product_id);

    if (!product || product.seller_id !== sellerId) {
        throw new Error("Review not found");
    }

    await reviewRepository.setSellerReply(reviewId, replyText);
};
