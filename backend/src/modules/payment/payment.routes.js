const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const paymentController = require("./payment.controller");
const { orderIdValidation } = require("./payment.validator");
const { verifyMalipopayWebhook, verifySelcomWebhook } = require("../../middleware/webhookAuth.middleware");

// Provider webhooks - called directly by MalipoPay/Selcom's servers, not
// by anyone logged into NEXORA. No authMiddleware (that's for logged-in
// users), but verifyMalipopayWebhook/verifySelcomWebhook check a shared
// secret header so this can't be forged by a random POST request - see
// webhookAuth.middleware.js for why that mattered.
router.post("/webhooks/malipopay", verifyMalipopayWebhook, paymentController.malipopayWebhook);
router.post("/webhooks/selcom", verifySelcomWebhook, paymentController.selcomWebhook);

router.post(
    "/:orderId/initiate",
    authMiddleware,
    authorize("buyer"),
    orderIdValidation,
    validationMiddleware,
    paymentController.initiateMobileMoneyPayment
);

router.get(
    "/:orderId",
    authMiddleware,
    orderIdValidation,
    validationMiddleware,
    paymentController.getPayment
);

router.put(
    "/:orderId/confirm-cod",
    authMiddleware,
    authorize("seller"),
    orderIdValidation,
    validationMiddleware,
    paymentController.confirmCashOnDelivery
);

module.exports = router;