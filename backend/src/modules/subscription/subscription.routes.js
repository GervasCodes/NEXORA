const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const { blockWhenPaymentsInMaintenance } = require("../../middleware/paymentsMaintenance.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const subscriptionController = require("./subscription.controller");
const {
    subscribeMobileMoneyValidation,
    subscribeRedirectValidation
} = require("./subscription.validator");

// Public
router.get("/plans", subscriptionController.listPlans);

// Seller
router.get("/me", authMiddleware, authorize("seller"), subscriptionController.getMySubscription);
router.get("/access", authMiddleware, authorize("seller"), subscriptionController.getMyAccess);

router.post(
    "/subscribe",
    authMiddleware,
    blockWhenPaymentsInMaintenance,
    authorize("seller"),
    subscribeMobileMoneyValidation,
    validationMiddleware,
    subscriptionController.subscribeMobileMoney
);

router.post(
    "/subscribe/card",
    authMiddleware,
    blockWhenPaymentsInMaintenance,
    authorize("seller"),
    subscribeRedirectValidation,
    validationMiddleware,
    subscriptionController.subscribeCard
);

router.post(
    "/subscribe/paypal",
    authMiddleware,
    blockWhenPaymentsInMaintenance,
    authorize("seller"),
    subscribeRedirectValidation,
    validationMiddleware,
    subscriptionController.subscribePaypal
);

router.post("/cancel", authMiddleware, authorize("seller"), subscriptionController.cancelMySubscription);

module.exports = router;
