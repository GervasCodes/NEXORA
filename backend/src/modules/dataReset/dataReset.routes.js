const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const requireSuperAdmin = require("../../middleware/requireSuperAdmin.middleware");

const dataResetController = require("./dataReset.controller");
const {
    sellerResetPreviewValidation,
    sellerResetValidation,
    platformResetPreviewValidation,
    platformResetValidation
} = require("./dataReset.validator");

router.use(authMiddleware, authorize("admin"));

// ---- Per-seller (regular admin) -------------------------------------------
// Blast radius is one seller's own records, which is the same level of
// damage a regular admin can already do account-by-account, so it sits
// behind the same gate as the rest of the admin panel.

router.get(
    "/seller/:sellerId/preview",
    sellerResetPreviewValidation,
    validationMiddleware,
    dataResetController.previewSellerReset
);

router.post(
    "/seller/:sellerId",
    sellerResetValidation,
    validationMiddleware,
    dataResetController.resetSeller
);

// ---- Full platform (super admin only) -------------------------------------
// A separate feature with a separate gate, not a parameter on the one
// above - per the Phase 1 decision. requireSuperAdmin is the same
// middleware guarding admin creation/removal and subscription-plan
// changes, so this is the existing "can break the whole platform" tier
// rather than a new permission concept.

router.get(
    "/platform/preview",
    requireSuperAdmin,
    platformResetPreviewValidation,
    validationMiddleware,
    dataResetController.previewPlatformReset
);

router.post(
    "/platform",
    requireSuperAdmin,
    platformResetValidation,
    validationMiddleware,
    dataResetController.resetPlatform
);

module.exports = router;
