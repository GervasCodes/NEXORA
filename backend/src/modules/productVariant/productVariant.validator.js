const { param, body } = require("express-validator");

exports.productIdValidation = [
    param("productId").isInt({ gt: 0 }).withMessage("Invalid product")
];

exports.replaceValidation = [
    body("options")
        .optional()
        .isArray()
        .withMessage("options must be an array"),
    body("options.*.name")
        .optional()
        .isLength({ min: 1, max: 60 })
        .withMessage("Each option needs a name (max 60 characters)"),
    body("options.*.values")
        .optional()
        .isArray({ min: 1 })
        .withMessage("Each option needs at least one value"),

    body("variants")
        .optional()
        .isArray()
        .withMessage("variants must be an array"),
    body("variants.*.options")
        .optional()
        .isObject()
        .withMessage("Each variant needs an options combination"),
    body("variants.*.stock")
        .optional()
        .isInt({ min: 0 })
        .withMessage("Stock must be zero or more"),
    body("variants.*.price_delta")
        .optional()
        .isFloat()
        .withMessage("Invalid price adjustment")
];
