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
    orderIdValidation,
    updateSettingsValidation,
    createAdminValidation,
    updateAdminPermissionsValidation
} = require("./admin.validator");

router.use(authMiddleware, authorize("admin"));

router.get("/dashboard", adminController.getDashboard);
router.get("/dispatch", adminController.getDispatchOverview);
router.get("/analytics", adminController.getAnalytics);
router.get("/fraud-flags", adminController.listFraudFlags);
router.put("/fraud-flags/:id/resolve", adminController.resolveFraudFlag);
router.get("/audit-logs", adminController.listAuditLogs);

router.get("/refunds", adminController.listRefunds);
router.get("/refunds/:id", adminController.getRefund);
router.post("/refunds/:id/retry", adminController.retryRefund);

router.get("/users", adminController.listUsers);
router.put("/users/:id/deactivate", userIdValidation, validationMiddleware, adminController.deactivateUser);
router.put("/users/:id/activate", userIdValidation, validationMiddleware, adminController.activateUser);

router.get("/sellers", adminController.listSellers);
router.put("/sellers/:id/verify", userIdValidation, validationMiddleware, adminController.verifySeller);
router.put("/sellers/:id/unverify", userIdValidation, validationMiddleware, adminController.unverifySeller);

router.get("/products", adminController.listProducts);
router.put("/products/:id/deactivate", productIdValidation, validationMiddleware, adminController.deactivateProduct);
router.put("/products/:id/activate", productIdValidation, validationMiddleware, adminController.activateProduct);
router.put("/products/:id/sponsor", productIdValidation, validationMiddleware, adminController.sponsorProduct);
router.put("/products/:id/unsponsor", productIdValidation, validationMiddleware, adminController.unsponsorProduct);

router.get("/orders", adminController.listOrders);

// Manual early release of one order's held seller earnings (Phase 9D) -
// see docs/ESCROW_ANALYSIS.md section 3.4. Bypasses the normal
// delivered + escrow_hold_days timing gate; still respects the
// dispute-freeze rule (adminService.releaseOrderEscrow -> walletService
// .releaseOrderEarnings).
router.put("/orders/:id/release-escrow", orderIdValidation, validationMiddleware, adminController.releaseOrderEscrow);

router.get("/settings", adminController.getSettings);
router.put("/settings", updateSettingsValidation, validationMiddleware, adminController.updateSettings);

// Read-only oversight of seller-paid sponsorship campaigns (Phase 8A).
// The manual sponsor/unsponsor toggle above (/products/:id/sponsor) stays
// the separate, free lever for admin curation - this is just visibility
// into what sellers are actually paying for.
router.get("/sponsorship-campaigns", adminController.listSponsorshipCampaigns);

// Read-only oversight of seller-paid featured-store campaigns (Phase 8B).
// There is no manual free toggle equivalent here - a store's featured
// placement is scoped per department and derived live from the
// store_featured_campaigns table (see
// category.repository.js#findFeaturedStoresByCategory).
router.get("/featured-store-campaigns", adminController.listFeaturedStoreCampaigns);

// Read-only oversight of seller-paid department-sponsorship campaigns
// (Phase 8C). Same reasoning as Featured Stores above - a department's
// homepage placement is derived live from the
// department_sponsorship_campaigns table (see
// category.repository.js#findAllActiveWithSponsorship).
router.get("/department-sponsorship-campaigns", adminController.listDepartmentSponsorshipCampaigns);

router.get("/withdrawals", adminController.listWithdrawals);
router.put("/withdrawals/:id/approve", withdrawalIdValidation, validationMiddleware, adminController.approveWithdrawal);
router.put("/withdrawals/:id/reject", withdrawalIdValidation, validationMiddleware, adminController.rejectWithdrawal);
router.put("/withdrawals/:id/paid", withdrawalIdValidation, validationMiddleware, adminController.markWithdrawalPaid);

// --- Admin management (super admin only) ---
router.get("/admins", requireSuperAdmin, adminController.listAdmins);
router.post("/admins", requireSuperAdmin, createAdminValidation, validationMiddleware, adminController.createAdmin);
router.put("/admins/:id/permissions", requireSuperAdmin, updateAdminPermissionsValidation, validationMiddleware, adminController.updateAdminPermissions);
router.delete("/admins/:id", requireSuperAdmin, userIdValidation, validationMiddleware, adminController.removeAdmin);

module.exports = router;
