const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const efdController = require("./efd.controller");
const {
    registerTaxInfoValidation,
    orderIdValidation,
    verifyRegistrationValidation
} = require("./efd.validator");

router.use(authMiddleware);

// --- Admin ---
router.get("/admin/pending", authorize("admin"), efdController.listPendingRegistrations);
router.put(
    "/admin/:userId/verify",
    authorize("admin"),
    verifyRegistrationValidation,
    validationMiddleware,
    efdController.verifyRegistration
);

// --- Seller ---
router.get("/seller/tax-info", authorize("seller"), efdController.getMyTaxInfo);
router.put(
    "/seller/tax-info",
    authorize("seller"),
    registerTaxInfoValidation,
    validationMiddleware,
    efdController.registerTaxInfo
);
router.get("/seller/receipts", authorize("seller"), efdController.getMyReceipts);

// --- Shared (buyer, seller, or admin - efd.service.js enforces
// per-order access) ---
router.get("/order/:orderId", orderIdValidation, validationMiddleware, efdController.getReceiptForOrder);

module.exports = router;
