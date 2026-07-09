const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const sellerController = require("./seller.controller");

const {
    createSellerValidation,
    updateSellerValidation,
    addDeliveryAgentValidation
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

module.exports = router;