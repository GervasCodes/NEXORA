const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const reviewController = require("./review.controller");
const {
    createReviewValidation,
    updateReviewValidation,
    reviewIdValidation,
    productIdValidation
} = require("./review.validator");

// Public - anyone can read a product's reviews
router.get(
    "/product/:productId",
    productIdValidation,
    validationMiddleware,
    reviewController.getProductReviews
);

// Buyer routes
router.post(
    "/",
    authMiddleware,
    authorize("buyer"),
    createReviewValidation,
    validationMiddleware,
    reviewController.createReview
);

router.put(
    "/:id",
    authMiddleware,
    authorize("buyer"),
    updateReviewValidation,
    validationMiddleware,
    reviewController.updateReview
);

router.delete(
    "/:id",
    authMiddleware,
    authorize("buyer"),
    reviewIdValidation,
    validationMiddleware,
    reviewController.deleteReview
);

module.exports = router;
