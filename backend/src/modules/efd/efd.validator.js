const { body, param } = require("express-validator");

exports.registerTaxInfoValidation = [
    body("tin")
        .matches(/^\d{9}$/)
        .withMessage("TIN must be exactly 9 digits"),
    body("vrn")
        .optional({ nullable: true })
        .isLength({ min: 4, max: 20 })
        .withMessage("Invalid VRN")
];

exports.orderIdValidation = [
    param("orderId").isInt({ gt: 0 }).withMessage("Invalid order")
];

exports.verifyRegistrationValidation = [
    param("userId").isInt({ gt: 0 }).withMessage("Invalid seller"),
    body("approved").isBoolean().withMessage("approved must be a boolean")
];
