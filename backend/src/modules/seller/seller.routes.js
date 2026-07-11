const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const sellerController = require("./seller.controller");

const {
    createSellerValidation,
    updateSellerValidation,
    addDeliveryAgentValidation,
    payVerificationFeeValidation
} = require("./seller.validator");

const {
    createSellerProfile,
    getSellerProfile,
    updateSellerProfile
} = require("./seller.controller");
const upload = require("../../middleware/upload.middleware");
const uploadDocument = require("../../middleware/uploadDocument.middleware");

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

router.get(
    "/analytics",
    authMiddleware,
    authorize("seller"),
    sellerController.getAnalytics
);

// --- Verification (National ID, Voter ID, business registration) ---

router.get(
    "/verification",
    authMiddleware,
    authorize("seller"),
    sellerController.getVerification
);

router.post(
    "/verification/documents",
    authMiddleware,
    authorize("seller"),
    uploadDocument.fields([
        { name: "national_id", maxCount: 1 },
        { name: "voter_id", maxCount: 1 },
        { name: "business_registration", maxCount: 1 }
    ]),
    sellerController.submitVerification
);

router.post(
    "/verification/fee",
    authMiddleware,
    authorize("seller"),
    payVerificationFeeValidation,
    validationMiddleware,
    sellerController.payVerificationFee
);

module.exports = router;