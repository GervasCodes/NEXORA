const reviewRepository = require("./review.repository");

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

exports.getProductReviews = async (productId) => {
    const [reviews, summary] = await Promise.all([
        reviewRepository.findByProduct(productId),
        reviewRepository.getProductRatingSummary(productId)
    ]);

    return {
        reviews,
        average_rating: summary.average_rating
            ? Number(Number(summary.average_rating).toFixed(1))
            : null,
        review_count: summary.review_count
    };
};
