const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const uploadDocument = require("../../middleware/uploadDocument.middleware");

const controller = require("./accountVerification.controller");

// Seller-facing side of the Verified Business tier upgrade. Mounted at
// /api/v1/seller/business-verification (before the general /seller
// mount - see app.js). BRELA / TIN / business license are PDF-only; that
// rule is enforced by uploadDocument's field-aware filter and content
// check (see utils/kycDocumentRules.js), not just the frontend.
router.use(authMiddleware, authorize("seller"), requireApprovedSeller);

router.get("/", controller.getMyBusinessStatus);
router.post(
    "/",
    uploadDocument.fields([
        { name: "brela_certificate", maxCount: 1 },
        { name: "tin_certificate", maxCount: 1 },
        { name: "business_license", maxCount: 1 }
    ]),
    controller.submitBusinessRequest
);

module.exports = router;
