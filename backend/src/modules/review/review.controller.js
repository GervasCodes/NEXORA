const reviewService = require("./review.service");

exports.createReview = async (req, res) => {
    try {
        const { product_id, rating, comment } = req.body;

        const result = await reviewService.createReview(
            req.user.id,
            product_id,
            rating,
            comment
        );

        return res.status(201).json({
            success: true,
            message: "Review submitted",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.updateReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;

        await reviewService.updateReview(
            req.params.id,
            req.user.id,
            rating,
            comment
        );

        return res.json({
            success: true,
            message: "Review updated"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.deleteReview = async (req, res) => {
    try {
        await reviewService.deleteReview(req.params.id, req.user.id);

        return res.json({
            success: true,
            message: "Review deleted"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getProductReviews = async (req, res) => {
    try {
        const result = await reviewService.getProductReviews(req.params.productId, req.query.sort);

        return res.json({
            success: true,
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Phase 5D - public, same as getProductReviews (anyone can read a store's
// reviews). `page` is an optional query param, same "?page=" convention
// GET /products already uses; anything not a positive integer falls back
// to page 1 rather than erroring, since a malformed page number here
// shouldn't 400 a store page that's otherwise loading fine.
exports.getStoreReviews = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const result = await reviewService.getStoreReviews(req.params.sellerId, page, req.query.sort);

        return res.json({
            success: true,
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Phase 6C - buyer attaches a photo to their own review, same
// req.file-required shape as product.controller.js's
// uploadProductImage/uploadProductVideo.
exports.uploadReviewPhoto = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "A photo file is required"
            });
        }

        const result = await reviewService.addReviewPhoto(
            req.user.id,
            req.params.id,
            req.file
        );

        return res.status(201).json({
            success: true,
            message: "Photo uploaded",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Phase 6C - seller reply to a review on one of their products.
exports.replyToReview = async (req, res) => {
    try {
        await reviewService.replyToReview(req.user.id, req.params.id, req.body.reply);

        return res.json({
            success: true,
            message: "Reply posted"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
