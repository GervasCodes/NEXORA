const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const maintenanceCheck = require("../../middleware/maintenance.middleware");

const returnController = require("./return.controller");
const {
    createReturnValidation,
    returnIdValidation,
    shippedBackValidation,
    rejectReturnValidation
} = require("./return.validator");

router.use(authMiddleware);

// --- Admin (mounted before the shared "/:id" routes, same reasoning as
// dispute.routes.js - admin list endpoints must never be mistaken for a
// numeric return id) ---
router.get("/admin", authorize("admin"), returnController.getAllReturns);
router.put("/admin/:id/approve", authorize("admin"), returnIdValidation, validationMiddleware, returnController.approveReturn);
router.put("/admin/:id/reject", authorize("admin"), rejectReturnValidation, validationMiddleware, returnController.rejectReturn);
router.put("/admin/:id/received", authorize("admin"), returnIdValidation, validationMiddleware, returnController.markReceived);

// --- Seller ---
router.get("/seller", authorize("seller"), returnController.getSellerReturns);
router.put("/seller/:id/approve", authorize("seller"), returnIdValidation, validationMiddleware, returnController.approveReturn);
router.put("/seller/:id/reject", authorize("seller"), rejectReturnValidation, validationMiddleware, returnController.rejectReturn);
router.put("/seller/:id/received", authorize("seller"), returnIdValidation, validationMiddleware, returnController.markReceived);

// --- Buyer --- (gated the same way disputes.filing is - reuses the
// existing "disputes" maintenance-toggle key so admins don't need a new
// toggle for a closely related buyer-protection flow)
router.get("/", authorize("buyer"), maintenanceCheck("disputes"), returnController.getMyReturns);
router.post("/", authorize("buyer"), maintenanceCheck("disputes"), createReturnValidation, validationMiddleware, returnController.requestReturn);
router.put("/:id/cancel", authorize("buyer"), returnIdValidation, validationMiddleware, returnController.cancelReturn);
router.put("/:id/ship-back", authorize("buyer"), shippedBackValidation, validationMiddleware, returnController.markShippedBack);

// --- Shared (buyer, seller, or admin - access is checked per return in
// return.service.js since it depends on which return) ---
router.get("/:id", returnIdValidation, validationMiddleware, returnController.getDetail);

module.exports = router;
