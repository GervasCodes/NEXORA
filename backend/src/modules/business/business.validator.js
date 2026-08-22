const { body, param } = require("express-validator");

exports.applyValidation = [
    body("businessName").notEmpty().isLength({ max: 150 }).withMessage("Business name is required"),
    body("businessTin").matches(/^\d{9}$/).withMessage("TIN must be exactly 9 digits")
];

exports.verifyValidation = [
    param("userId").isInt({ gt: 0 }).withMessage("Invalid user"),
    body("approved").isBoolean().withMessage("approved must be a boolean")
];

exports.productIdValidation = [
    param("productId").isInt({ gt: 0 }).withMessage("Invalid product")
];

exports.setTiersValidation = [
    param("productId").isInt({ gt: 0 }).withMessage("Invalid product"),
    body("tiers").isArray().withMessage("tiers must be an array"),
    body("tiers.*.minQuantity").isInt({ min: 2 }).withMessage("Each tier needs a minimum quantity of at least 2"),
    body("tiers.*.unitPrice").isFloat({ gt: 0 }).withMessage("Each tier needs a valid unit price")
];
