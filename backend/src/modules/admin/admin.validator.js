const { param, body } = require("express-validator");

exports.userIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid user")
];

exports.productIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid product")
];

exports.withdrawalIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid withdrawal request")
];

exports.updateSettingsValidation = [
    body("commission_rate")
        .optional()
        .isFloat({ min: 0, max: 100 })
        .withMessage("Commission rate must be between 0 and 100"),

    body("rider_delivery_fee")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Rider delivery fee must be a positive amount")
];
