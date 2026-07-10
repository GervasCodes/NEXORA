const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const paymentController = require("./payment.controller");
const { orderIdValidation } = require("./payment.validator");

// Provider webhooks - called directly by MalipoPay/Selcom's servers, not
// by anyone logged into NEXORA. No authMiddleware here on purpose.
router.post("/webhooks/malipopay", paymentController.malipopayWebhook);
router.post("/webhooks/selcom", paymentController.selcomWebhook);

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