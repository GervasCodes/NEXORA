const { body, param } = require("express-validator");

exports.createReviewValidation = [
    body("product_id")
        .notEmpty()
        .withMessage("Product is required")
        .isInt({ gt: 0 })
        .withMessage("Invalid product"),

    body("rating")
        .notEmpty()
        .withMessage("Rating is required")
        .isInt({ min: 1, max: 5 })
        .withMessage("Rating must be between 1 and 5"),

    body("comment")
        .optional()
        .isString()
        .isLength({ max: 1000 })
        .withMessage("Comment is too long")
];

exports.updateReviewValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid review"),

    body("rating")
        .notEmpty()
        .withMessage("Rating is required")
        .isInt({ min: 1, max: 5 })
        .withMessage("Rating must be between 1 and 5"),

    body("comment")
        .optional()
        .isString()
        .isLength({ max: 1000 })
        .withMessage("Comment is too long")
];

exports.reviewIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid review")
];

exports.productIdValidation = [
    param("productId").isInt({ gt: 0 }).withMessage("Invalid product")
];

exports.sellerIdValidation = [
    param("sellerId").isInt({ gt: 0 }).withMessage("Invalid store")
];

// Phase 6C - seller reply to a review.
exports.replyValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid review"),

    body("reply")
        .notEmpty()
        .withMessage("Reply is required")
        .isString()
        .isLength({ max: 1000 })
        .withMessage("Reply is too long")
];
