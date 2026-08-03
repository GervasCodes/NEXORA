const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
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

router.post(
    "/subscribe",
    authMiddleware,
    authorize("seller"),
    subscribeMobileMoneyValidation,
    validationMiddleware,
    subscriptionController.subscribeMobileMoney
);

router.post(
    "/subscribe/snippe",
    authMiddleware,
    authorize("seller"),
    subscribeRedirectValidation,
    validationMiddleware,
    subscriptionController.subscribeSnippe
);

router.post(
    "/subscribe/malipopay-card",
    authMiddleware,
    authorize("seller"),
    subscribeRedirectValidation,
    validationMiddleware,
    subscriptionController.subscribeMalipopayCard
);

router.post(
    "/subscribe/paypal",
    authMiddleware,
    authorize("seller"),
    subscribeRedirectValidation,
    validationMiddleware,
    subscriptionController.subscribePaypal
);

router.post("/cancel", authMiddleware, authorize("seller"), subscriptionController.cancelMySubscription);

module.exports = router;
