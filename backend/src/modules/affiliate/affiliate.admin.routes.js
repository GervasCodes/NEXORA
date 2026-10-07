const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");

const affiliateAdminController = require("./affiliate.admin.controller");

router.use(authMiddleware, authorize("admin"));

router.get("/accounts", affiliateAdminController.listAccounts);
router.post("/accounts/:userId/approve", affiliateAdminController.approve);
router.post("/accounts/:userId/reject", affiliateAdminController.reject);
router.get("/conversions", affiliateAdminController.listConversions);

router.get("/payouts", affiliateAdminController.listPayouts);
router.post("/payouts/:id/paid", affiliateAdminController.markPayoutPaid);
router.post("/payouts/:id/reject", affiliateAdminController.rejectPayout);

module.exports = router;
