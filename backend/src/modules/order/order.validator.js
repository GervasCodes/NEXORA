const { body, param } = require("express-validator");
const { PAYMENT_METHODS, SELLER_STATUS_TRANSITIONS } = require("../../constants/orderStatus");

exports.checkoutValidation = [
    body("payment_method")
        .isIn(PAYMENT_METHODS)
        .withMessage("Invalid payment method"),

    body("shipping_address")
        .notEmpty()
        .withMessage("Shipping address is required"),

    body("shipping_city")
        .notEmpty()
        .withMessage("City is required"),

    body("shipping_region")
        .notEmpty()
        .withMessage("Region is required"),

    body("shipping_phone")
        .notEmpty()
        .withMessage("Contact phone is required"),

    body("delivery_lat")
        .optional({ nullable: true })
        .isFloat({ min: -90, max: 90 })
        .withMessage("Invalid delivery latitude"),

    body("delivery_lng")
        .optional({ nullable: true })
        .isFloat({ min: -180, max: 180 })
        .withMessage("Invalid delivery longitude")
];

exports.orderIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid order")
];

exports.updateOrderStatusValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid order"),

    body("status")
        .isIn(Object.values(SELLER_STATUS_TRANSITIONS).flat())
        .withMessage("Invalid status"),

    body("agent_id")
        .optional()
        .isInt({ gt: 0 })
        .withMessage("Invalid agent")
];
