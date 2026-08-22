const { body, param } = require("express-validator");
const { PAYMENT_METHODS, SELLER_STATUS_TRANSITIONS } = require("../../constants/orderStatus");
const phoneValidator = require("../../validators/sharedPhoneValidator");

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

    phoneValidator("shipping_phone", { countryField: "shipping_phone_country" }),

    body("delivery_lat")
        .optional({ nullable: true })
        .isFloat({ min: -90, max: 90 })
        .withMessage("Invalid delivery latitude"),

    body("delivery_lng")
        .optional({ nullable: true })
        .isFloat({ min: -180, max: 180 })
        .withMessage("Invalid delivery longitude"),

    body("buyer_protection_addon")
        .optional()
        .isBoolean()
        .withMessage("Invalid buyer protection selection"),

    body("pickup_point_id")
        .optional({ nullable: true })
        .isInt({ gt: 0 })
        .withMessage("Invalid pickup point"),

    body("loyalty_points_redeemed")
        .optional({ nullable: true })
        .isInt({ min: 0 })
        .withMessage("Invalid loyalty points amount"),

    body("affiliate_click_token")
        .optional({ nullable: true })
        .isLength({ max: 40 })
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
