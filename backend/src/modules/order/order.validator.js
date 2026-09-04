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

    // Phase 1 (UI/UX remediation): when set, order.service.js substitutes
    // this saved address's fields in for the free-text shipping_address/
    // city/region/phone above, the same way pickup_point_id already
    // substitutes a pickup point's address - shipping_address etc. stay
    // required at the schema level so older clients that haven't added
    // the address picker yet keep working unchanged.
    body("address_id")
        .optional({ nullable: true })
        .isInt({ gt: 0 })
        .withMessage("Invalid address"),

    body("coupon_code")
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ max: 40 })
        .withMessage("Invalid code"),

    body("loyalty_points_redeemed")
        .optional({ nullable: true })
        .isInt({ min: 0 })
        .withMessage("Invalid loyalty points amount"),

    body("affiliate_click_token")
        .optional({ nullable: true })
        .isLength({ max: 40 })
];

// Phase 6 (Checkout & Order Timeline UX): validates the pin the buyer has
// currently dropped on LocationPicker so Checkout.jsx can ask for an
// upfront delivery-time estimate before paying. Same lat/lng bounds as
// checkoutValidation's delivery_lat/delivery_lng, but both are required
// here (no pin yet just means "don't call this endpoint yet" on the
// frontend, rather than something for the backend to fall back on).
exports.deliveryEstimateValidation = [
    body("delivery_lat")
        .isFloat({ min: -90, max: 90 })
        .withMessage("Invalid delivery latitude"),

    body("delivery_lng")
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
