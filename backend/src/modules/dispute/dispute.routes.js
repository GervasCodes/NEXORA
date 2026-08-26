const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
// Dispute evidence (e.g. a receipt or a delivery note) is commonly a
// PDF, not just a photo - use the image-or-PDF middleware instead of
// the image-only one.
const upload = require("../../middleware/uploadDocument.middleware");
const maintenanceCheck = require("../../middleware/maintenance.middleware");

const disputeController = require("./dispute.controller");
const {
    createDisputeValidation,
    disputeIdValidation,
    messageValidation,
    resolveValidation,
    rejectValidation
} = require("./dispute.validator");

router.use(authMiddleware);

// --- Admin (mounted before the shared "/:id" routes so admin-only list
// endpoints aren't ever mistaken for a numeric dispute id) ---
router.get("/admin", authorize("admin"), disputeController.getAllDisputes);
router.put(
    "/admin/:id/review",
    authorize("admin"),
    disputeIdValidation,
    validationMiddleware,
    disputeController.markUnderReview
);
router.put(
    "/admin/:id/resolve",
    authorize("admin"),
    resolveValidation,
    validationMiddleware,
    disputeController.resolveDispute
);
router.put(
    "/admin/:id/reject",
    authorize("admin"),
    rejectValidation,
    validationMiddleware,
    disputeController.rejectDispute
);

// --- Seller ---
router.get("/seller", authorize("seller"), disputeController.getSellerDisputes);

// --- Buyer --- (gated: filing/browsing disputes is the "functionality"
// the admin's Maintenance toggle turns off; sellers/admins above keep
// working normally with anything already filed)
router.get("/", authorize("buyer"), maintenanceCheck("disputes"), disputeController.getMyDisputes);
router.post(
    "/",
    authorize("buyer"),
    maintenanceCheck("disputes"),
    createDisputeValidation,
    validationMiddleware,
    disputeController.createDispute
);
router.put(
    "/:id/withdraw",
    authorize("buyer"),
    disputeIdValidation,
    validationMiddleware,
    disputeController.withdrawDispute
);

// --- Shared (buyer, seller, or admin - authorization is checked per
// dispute in dispute.service.js since access depends on which dispute) ---
router.get("/:id", disputeIdValidation, validationMiddleware, disputeController.getDetail);
router.post(
    "/:id/evidence",
    upload.single("file"),
    disputeIdValidation,
    validationMiddleware,
    disputeController.addEvidence
);
router.post("/:id/messages", messageValidation, validationMiddleware, disputeController.addMessage);

module.exports = router;
