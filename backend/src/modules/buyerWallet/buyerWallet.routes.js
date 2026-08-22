const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const buyerWalletController = require("./buyerWallet.controller");

router.use(authMiddleware, authorize("buyer"));

// Top-up itself is initiated through the payments module (POST
// /payments/wallet/topup - it needs the mobile money provider/webhook
// plumbing that lives there), so this module only exposes reads. See
// buyerWallet.service.js's header comment for the full flow.
router.get("/me", buyerWalletController.getSummary);

module.exports = router;
