const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const paymentController = require("./payment.controller");
const { orderIdValidation } = require("./payment.validator");

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
