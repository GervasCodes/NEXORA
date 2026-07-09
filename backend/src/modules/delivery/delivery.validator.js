const { param, body } = require("express-validator");
const { DELIVERY_STATUS_TRANSITIONS } = require("../../constants/orderStatus");

exports.orderIdValidation = [
    param("orderId").isInt({ gt: 0 }).withMessage("Invalid order")
];

exports.updateDeliveryStatusValidation = [
    param("orderId").isInt({ gt: 0 }).withMessage("Invalid order"),

    body("status")
        .isIn(Object.values(DELIVERY_STATUS_TRANSITIONS).flat())
        .withMessage("Invalid status"),

    body("notes").optional().isString()
];
