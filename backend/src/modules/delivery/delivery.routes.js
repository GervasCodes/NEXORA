const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const deliveryController = require("./delivery.controller");
const {
    orderIdValidation,
    updateDeliveryStatusValidation
} = require("./delivery.validator");

// Delivery agent routes
router.get(
    "/available",
    authMiddleware,
    authorize("delivery_agent"),
    deliveryController.getAvailableForPickup
);

router.post(
    "/:orderId/claim",
    authMiddleware,
    authorize("delivery_agent"),
    orderIdValidation,
    validationMiddleware,
    deliveryController.claimDelivery
);

router.put(
    "/online",
    authMiddleware,
    authorize("delivery_agent"),
    deliveryController.setOnlineStatus
);

router.get(
    "/my/list",
    authMiddleware,
    authorize("delivery_agent"),
    deliveryController.getMyDeliveries
);

router.put(
    "/:orderId/status",
    authMiddleware,
    authorize("delivery_agent"),
    updateDeliveryStatusValidation,
    validationMiddleware,
    deliveryController.updateDeliveryStatus
);

// Shared route - buyer, seller (with item in order), or assigned agent
router.get(
    "/:orderId",
    authMiddleware,
    orderIdValidation,
    validationMiddleware,
    deliveryController.getDelivery
);

module.exports = router;
