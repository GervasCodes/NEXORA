const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const upload = require("../../middleware/upload.middleware");

const reviewController = require("./review.controller");
const {
    createReviewValidation,
    updateReviewValidation,
    reviewIdValidation,
    productIdValidation,
    sellerIdValidation,
    replyValidation
} = require("./review.validator");

// Public - anyone can read a product's reviews
router.get(
    "/product/:productId",
    productIdValidation,
    validationMiddleware,
    reviewController.getProductReviews
);

// Public - anyone can read a store's reviews (Phase 5D). "/store/:sellerId"
// is a distinct literal-first segment from "/product/:productId" above, so
// there's no route-matching ambiguity between the two.
router.get(
    "/store/:sellerId",
    sellerIdValidation,
    validationMiddleware,
    reviewController.getStoreReviews
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

// Phase 6C - buyer attaches a photo to their own review. Reuses the
// image-only upload.middleware.js (5MB) - a review photo is the same
// media type/size class as a product image, no need for a new middleware.
router.post(
    "/:id/photos",
    authMiddleware,
    authorize("buyer"),
    reviewIdValidation,
    validationMiddleware,
    upload.single("photo"),
    reviewController.uploadReviewPhoto
);

// Phase 6C - seller reply to a review on one of their products.
// requireApprovedSeller isn't used here (unlike product mutation routes):
// a seller only ever has reviews to reply to on products they were
// already approved to list, so the ownership check inside
// review.service.js's replyToReview is the real gate.
router.post(
    "/:id/reply",
    authMiddleware,
    authorize("seller"),
    replyValidation,
    validationMiddleware,
    reviewController.replyToReview
);

module.exports = router;
