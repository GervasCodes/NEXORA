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

    body("notes").optional().isString(),

    // Delivery proof (Phase 5, P0) - required only when status is
    // "delivered", enforced in delivery.service.js (not here) since
    // that's conditional on the `status` field also present in this
    // same body, which express-validator can do but is clearer written
    // as a plain check in the service alongside the rest of the
    // delivered-transition logic.
    body("handover_code").optional().isString().isLength({ min: 4, max: 6 }),
    body("delivery_lat").optional().isFloat(),
    body("delivery_lng").optional().isFloat()
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
