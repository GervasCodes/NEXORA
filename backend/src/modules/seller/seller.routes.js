const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const requireSubscriptionTier = require("../../middleware/requireSubscriptionTier.middleware");
const sellerController = require("./seller.controller");

const {
    createSellerValidation,
    updateSellerValidation,
    addDeliveryAgentValidation,
    createCollectionValidation,
    addCollectionProductValidation,
    merchantTypeValidation
} = require("./seller.validator");

const {
    createSellerProfile,
    getSellerProfile,
    updateSellerProfile
} = require("./seller.controller");
const upload = require("../../middleware/upload.middleware");
const uploadVideo = require("../../middleware/uploadVideo.middleware");

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

// Store promo video (Phase 7 - Promo Video Unification), managed from
// the Promote hub (SellerPromote.jsx) - uploadVideo.single, not
// upload.single, since this is video/* not image/* (see
// uploadVideo.middleware.js for the size cap + content-type check
// difference).
router.post(
    "/promo-video",
    authMiddleware,
    authorize("seller"),
    uploadVideo.single("video"),
    sellerController.uploadPromoVideo
);

router.delete(
    "/promo-video",
    authMiddleware,
    authorize("seller"),
    sellerController.deletePromoVideo
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

// --- Seller collections ---
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

// Account approval (requireApprovedSeller) is enforced here; a paid
// subscription tier (requireSubscriptionTier) is additionally required
// for Analytics specifically - the one-time verification fee that used
// to gate this was retired; see requireSubscriptionTier.middleware.js.
router.get(
    "/analytics",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireSubscriptionTier,
    sellerController.getAnalytics
);

// (Advanced Analytics) - period comparison + top customers,
// plus a CSV export of top customers/products. Same gates as /analytics.
router.get(
    "/analytics/advanced",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireSubscriptionTier,
    sellerController.getAdvancedAnalytics
);

router.get(
    "/analytics/export",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireSubscriptionTier,
    sellerController.exportAnalyticsCsv
);

// --- Nexora Services  Merchant Type System ---
// A seller opts into Services (or both) here; account approval isn't
// required to flip this since it's just a dashboard-access flag - the
// Services endpoints themselves (service.routes.js) still require an
// approved seller underneath requireServiceProvider.
router.put(
    "/merchant-type",
    authMiddleware,
    authorize("seller"),
    merchantTypeValidation,
    validationMiddleware,
    sellerController.setMerchantType
);

module.exports = router;