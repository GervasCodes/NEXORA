const { body, param } = require("express-validator");

exports.addToCartValidation = [
    body("product_id")
        .notEmpty()
        .withMessage("Product is required")
        .isInt({ gt: 0 })
        .withMessage("Invalid product"),

    body("quantity")
        .optional()
        .isInt({ gt: 0 })
        .withMessage("Quantity must be a positive whole number"),

    // Optional (Phase 2 continuation, UI/UX remediation): only present
    // when the buyer selected a variant on the product detail page -
    // absent entirely for the many products with no variants at all.
    body("variant_id")
        .optional({ nullable: true })
        .isInt({ gt: 0 })
        .withMessage("Invalid variant")
];

const optionalVariantIdParam = param("variantId")
    .optional({ nullable: true })
    .isInt({ gt: 0 })
    .withMessage("Invalid variant");

exports.updateCartValidation = [
    param("productId")
        .isInt({ gt: 0 })
        .withMessage("Invalid product"),

    optionalVariantIdParam,

    body("quantity")
        .notEmpty()
        .withMessage("Quantity is required")
        .isInt({ gt: 0 })
        .withMessage("Quantity must be a positive whole number")
];

exports.removeFromCartValidation = [
    param("productId")
        .isInt({ gt: 0 })
        .withMessage("Invalid product"),

    optionalVariantIdParam
];
