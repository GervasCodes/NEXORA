const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const deliveryController = require("./delivery.controller");
const requireApprovedDeliveryAgent = require("../../middleware/requireApprovedDeliveryAgent.middleware");
const {
    orderIdValidation,
    updateDeliveryStatusValidation
} = require("./delivery.validator");

// Delivery agent routes - all gated behind requireApprovedDeliveryAgent,
// so none of this works until an admin approves the agent's verification
// documents submitted at registration.
router.get(
    "/available",
    authMiddleware,
    authorize("delivery_agent"),
    requireApprovedDeliveryAgent,
    deliveryController.getAvailableForPickup
);

router.post(
    "/:orderId/claim",
    authMiddleware,
    authorize("delivery_agent"),
    requireApprovedDeliveryAgent,
    orderIdValidation,
    validationMiddleware,
    deliveryController.claimDelivery
);

router.put(
    "/online",
    authMiddleware,
    authorize("delivery_agent"),
    requireApprovedDeliveryAgent,
    deliveryController.setOnlineStatus
);

router.get(
    "/my/list",
    authMiddleware,
    authorize("delivery_agent"),
    requireApprovedDeliveryAgent,
    deliveryController.getMyDeliveries
);

router.put(
    "/:orderId/status",
    authMiddleware,
    authorize("delivery_agent"),
    requireApprovedDeliveryAgent,
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
