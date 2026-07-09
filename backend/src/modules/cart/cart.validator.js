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
        .withMessage("Quantity must be a positive whole number")
];

exports.updateCartValidation = [
    param("productId")
        .isInt({ gt: 0 })
        .withMessage("Invalid product"),

    body("quantity")
        .notEmpty()
        .withMessage("Quantity is required")
        .isInt({ gt: 0 })
        .withMessage("Quantity must be a positive whole number")
];

exports.removeFromCartValidation = [
    param("productId")
        .isInt({ gt: 0 })
        .withMessage("Invalid product")
];
