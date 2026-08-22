const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const referralController = require("./referral.controller");

// Redemption itself happens as part of checkout (order.service.js), not
// a standalone endpoint here - same reasoning as the buyer-protection
// add-on and pickup points, both of which are also "one field in the
// checkout payload", not their own POST. This route is read-only: your
// own referral code, points balance, ledger, and referral history.
router.use(authMiddleware);
router.get("/me", referralController.getMyStatus);

module.exports = router;
