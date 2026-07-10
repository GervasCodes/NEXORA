const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const walletController = require("./wallet.controller");
const { requestWithdrawalValidation } = require("./wallet.validator");

router.use(authMiddleware, authorize("seller"));

router.get("/", walletController.getWallet);
router.get("/withdrawals", walletController.getMyWithdrawals);
router.post(
    "/withdrawals",
    requestWithdrawalValidation,
    validationMiddleware,
    walletController.requestWithdrawal
);

module.exports = router;
