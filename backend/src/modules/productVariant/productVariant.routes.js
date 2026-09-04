const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const productVariantController = require("./productVariant.controller");
const { productIdValidation, replaceValidation } = require("./productVariant.validator");

// Public - the buyer-facing PDP selector reads this.
router.get("/products/:productId/variants", productIdValidation, validationMiddleware, productVariantController.get);

// Seller-only - ownership is checked in productVariant.service.js
// against products.seller_id, same as every other seller-product
// mutation in this codebase.
router.put(
    "/products/:productId/variants",
    authMiddleware,
    authorize("seller"),
    productIdValidation,
    replaceValidation,
    validationMiddleware,
    productVariantController.replace
);

module.exports = router;
