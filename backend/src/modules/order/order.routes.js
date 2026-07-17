const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");

const orderController = require("./order.controller");
const {
    checkoutValidation,
    orderIdValidation,
    updateOrderStatusValidation
} = require("./order.validator");

// Buyer routes
router.post(
    "/",
    authMiddleware,
    authorize("buyer"),
    checkoutValidation,
    validationMiddleware,
    orderController.checkout
);

router.get(
    "/",
    authMiddleware,
    authorize("buyer"),
    orderController.getMyOrders
);

router.get(
    "/:id",
    authMiddleware,
    authorize("buyer"),
    orderIdValidation,
    validationMiddleware,
    orderController.getOrderDetail
);

router.put(
    "/:id/cancel",
    authMiddleware,
    authorize("buyer"),
    orderIdValidation,
    validationMiddleware,
    orderController.cancelOrder
);

// Seller routes - gated by requireApprovedSeller (account verification
// approved + store profile set up), consistent with product creation.
// This closed a gap where an unapproved seller account could still view
// and update orders directly via the API even though the frontend
// (SellerLayout) already blocked reaching these pages.
router.get(
    "/seller/list",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    orderController.getSellerOrders
);

router.get(
    "/seller/:id",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    orderIdValidation,
    validationMiddleware,
    orderController.getSellerOrderDetail
);

router.put(
    "/:id/status",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    updateOrderStatusValidation,
    validationMiddleware,
    orderController.updateOrderStatus
);

module.exports = router;
