const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const adminController = require("./admin.controller");
const requireSuperAdmin = require("../../middleware/requireSuperAdmin.middleware");
const {
    userIdValidation,
    productIdValidation,
    withdrawalIdValidation,
    updateSettingsValidation,
    rejectVerificationValidation,
    createAdminValidation,
    updateAdminPermissionsValidation
} = require("./admin.validator");

router.use(authMiddleware, authorize("admin"));

router.get("/dashboard", adminController.getDashboard);
router.get("/analytics", adminController.getAnalytics);
router.get("/fraud-flags", adminController.listFraudFlags);
router.put("/fraud-flags/:id/resolve", adminController.resolveFraudFlag);

router.get("/users", adminController.listUsers);
router.put("/users/:id/deactivate", userIdValidation, validationMiddleware, adminController.deactivateUser);
router.put("/users/:id/activate", userIdValidation, validationMiddleware, adminController.activateUser);

router.get("/sellers", adminController.listSellers);
router.put("/sellers/:id/verify", userIdValidation, validationMiddleware, adminController.verifySeller);
router.put("/sellers/:id/unverify", userIdValidation, validationMiddleware, adminController.unverifySeller);

router.get("/products", adminController.listProducts);
router.put("/products/:id/deactivate", productIdValidation, validationMiddleware, adminController.deactivateProduct);
router.put("/products/:id/activate", productIdValidation, validationMiddleware, adminController.activateProduct);

router.get("/orders", adminController.listOrders);

router.get("/settings", adminController.getSettings);
router.put("/settings", updateSettingsValidation, validationMiddleware, adminController.updateSettings);

router.get("/withdrawals", adminController.listWithdrawals);
router.put("/withdrawals/:id/approve", withdrawalIdValidation, validationMiddleware, adminController.approveWithdrawal);
router.put("/withdrawals/:id/reject", withdrawalIdValidation, validationMiddleware, adminController.rejectWithdrawal);
router.put("/withdrawals/:id/paid", withdrawalIdValidation, validationMiddleware, adminController.markWithdrawalPaid);

// --- Seller verification review ---
router.get("/verifications", adminController.listPendingVerifications);
router.get("/verifications/:id/documents", userIdValidation, validationMiddleware, adminController.getVerificationDocuments);
router.put("/verifications/:id/approve", userIdValidation, validationMiddleware, adminController.approveVerification);
router.put("/verifications/:id/reject", rejectVerificationValidation, validationMiddleware, adminController.rejectVerification);

// --- Admin management (super admin only) ---
router.get("/admins", requireSuperAdmin, adminController.listAdmins);
router.post("/admins", requireSuperAdmin, createAdminValidation, validationMiddleware, adminController.createAdmin);
router.put("/admins/:id/permissions", requireSuperAdmin, updateAdminPermissionsValidation, validationMiddleware, adminController.updateAdminPermissions);
router.delete("/admins/:id", requireSuperAdmin, userIdValidation, validationMiddleware, adminController.removeAdmin);

module.exports = router;
