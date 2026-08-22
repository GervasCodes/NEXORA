const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const upload = require("../../middleware/upload.middleware");

const kycController = require("./kyc.controller");
const { requestUpgradeValidation, requestIdValidation, rejectValidation } = require("./kyc.validator");

router.use(authMiddleware);

// --- Admin ---
router.get("/admin", authorize("admin"), kycController.listRequests);
router.put("/admin/:id/approve", authorize("admin"), requestIdValidation, validationMiddleware, kycController.approve);
router.put("/admin/:id/reject", authorize("admin"), rejectValidation, validationMiddleware, kycController.reject);

// --- Buyer ---
router.get("/me", kycController.getMyStatus);
router.post(
    "/upgrade",
    upload.single("document"),
    requestUpgradeValidation,
    validationMiddleware,
    kycController.requestUpgrade
);

module.exports = router;
