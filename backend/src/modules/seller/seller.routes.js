const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const requireVerificationFeePaid = require("../../middleware/requireVerificationFeePaid.middleware");
const sellerController = require("./seller.controller");

const {
    createSellerValidation,
    updateSellerValidation,
    addDeliveryAgentValidation,
    createCollectionValidation,
    addCollectionProductValidation,
    payVerificationFeeValidation
} = require("./seller.validator");

const {
    createSellerProfile,
    getSellerProfile,
    updateSellerProfile
} = require("./seller.controller");
const upload = require("../../middleware/upload.middleware");

// Upload logo
router.post(
    "/upload-logo",
    authMiddleware,
    authorize("seller"),
    upload.single("logo"),
    sellerController.uploadStoreLogo
);

router.post(
    "/profile",
    authMiddleware,
    authorize("seller"),
    createSellerValidation,
    validationMiddleware,
    createSellerProfile
);

router.get(
    "/profile",
    authMiddleware,
    authorize("seller"),
    getSellerProfile
);

router.put(
    "/profile",
    authMiddleware,
    authorize("seller"),
    updateSellerValidation,
    validationMiddleware,
    updateSellerProfile
);

router.post(
    "/upload-banner",
    authMiddleware,
    authorize("seller"),
    upload.single("banner"),
    sellerController.uploadStoreBanner
);

router.get(
    "/delivery-agents",
    authMiddleware,
    authorize("seller"),
    sellerController.getDeliveryRoster
);

router.post(
    "/delivery-agents",
    authMiddleware,
    authorize("seller"),
    addDeliveryAgentValidation,
    validationMiddleware,
    sellerController.addDeliveryAgent
);

router.delete(
    "/delivery-agents/:agentId",
    authMiddleware,
    authorize("seller"),
    sellerController.removeDeliveryAgent
);

// --- Seller collections (Phase 7C) ---
// Same auth shape as the delivery-agents routes above - authenticated,
// approved-seller-not-required (a seller can organize their own catalog
// into shelves before or after approval, same as managing products
// themselves doesn't gate on requireApprovedSeller for reads).

router.get(
    "/collections",
    authMiddleware,
    authorize("seller"),
    sellerController.getCollections
);

router.post(
    "/collections",
    authMiddleware,
    authorize("seller"),
    createCollectionValidation,
    validationMiddleware,
    sellerController.createCollection
);

router.delete(
    "/collections/:id",
    authMiddleware,
    authorize("seller"),
    sellerController.deleteCollection
);

router.get(
    "/collections/:id/products",
    authMiddleware,
    authorize("seller"),
    sellerController.getCollectionProducts
);

router.post(
    "/collections/:id/products",
    authMiddleware,
    authorize("seller"),
    addCollectionProductValidation,
    validationMiddleware,
    sellerController.addProductToCollection
);

router.delete(
    "/collections/:id/products/:productId",
    authMiddleware,
    authorize("seller"),
    sellerController.removeProductFromCollection
);

// Account approval (requireApprovedSeller) is enforced here; the paid
// Verified Seller fee gate (requireVerificationFeePaid) is additionally
// required for Analytics specifically - see requireVerificationFeePaid
// for why the two are separate middlewares.
router.get(
    "/analytics",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireVerificationFeePaid,
    sellerController.getAnalytics
);

// --- Verification fee (paid "Verified Seller" badge) ---
// The old post-registration document-upload flow (national ID, voter
// ID, business registration) that used to live here was removed -
// account-level verification now happens at registration itself and is
// reviewed via the accountVerification module. This fee is a separate,
// still-needed concept: it unlocks the paid badge (and, since Phase 3,
// Analytics) once the account is already approved.
router.post(
    "/verification/fee",
    authMiddleware,
    authorize("seller"),
    payVerificationFeeValidation,
    validationMiddleware,
    sellerController.payVerificationFee
);

module.exports = router;