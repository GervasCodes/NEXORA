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

exports.rateDeliveryValidation = [
    param("orderId").isInt({ gt: 0 }).withMessage("Invalid order"),

    body("rating")
        .notEmpty()
        .withMessage("Rating is required")
        .isInt({ min: 1, max: 5 })
        .withMessage("Rating must be between 1 and 5"),

    body("comment")
        .optional()
        .isString()
        .isLength({ max: 500 })
        .withMessage("Comment is too long")
];
