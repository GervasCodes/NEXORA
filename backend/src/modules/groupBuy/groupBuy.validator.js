const { body, param } = require("express-validator");

exports.createValidation = [
    body("productId").isInt({ gt: 0 }).withMessage("Invalid product"),
    body("groupPrice").isFloat({ gt: 0 }).withMessage("Invalid group price"),
    body("minParticipants").isInt({ min: 2 }).withMessage("Minimum 2 participants required"),
    body("deadline").isISO8601().withMessage("Invalid deadline")
];

exports.idValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid group buy")
];

exports.claimValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid group buy"),
    body("shipping_address").notEmpty().withMessage("Shipping address is required"),
    body("shipping_city").notEmpty().withMessage("Shipping city is required"),
    body("shipping_region").notEmpty().withMessage("Shipping region is required"),
    body("shipping_phone").notEmpty().withMessage("Shipping phone is required"),
    body("payment_method").notEmpty().withMessage("Payment method is required")
];
