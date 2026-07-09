const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const cartController = require("./cart.controller");
const {
    addToCartValidation,
    updateCartValidation,
    removeFromCartValidation
} = require("./cart.validator");

router.post(
    "/",
    authMiddleware,
    authorize("buyer"),
    addToCartValidation,
    validationMiddleware,
    cartController.addToCart
);

router.get(
    "/",
    authMiddleware,
    authorize("buyer"),
    cartController.getCart
);

router.put(
    "/:productId",
    authMiddleware,
    authorize("buyer"),
    updateCartValidation,
    validationMiddleware,
    cartController.updateCartItem
);

router.delete(
    "/:productId",
    authMiddleware,
    authorize("buyer"),
    removeFromCartValidation,
    validationMiddleware,
    cartController.removeFromCart
);

router.delete(
    "/",
    authMiddleware,
    authorize("buyer"),
    cartController.clearCart
);

module.exports = router;
