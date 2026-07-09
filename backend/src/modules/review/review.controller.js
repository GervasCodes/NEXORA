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
        const result = await reviewService.getProductReviews(req.params.productId);

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
