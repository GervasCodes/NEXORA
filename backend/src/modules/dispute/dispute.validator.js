const { body, param } = require("express-validator");

const DISPUTE_TYPES = [
    "damaged_item",
    "delayed_delivery",
    "defective_product",
    "wrong_item",
    "missing_delivery",
    "other"
];

const RESOLUTIONS = ["refund_full", "refund_partial", "replacement", "compensation", "no_action"];

exports.createDisputeValidation = [
    body("order_id")
        .notEmpty().withMessage("Order is required")
        .isInt({ gt: 0 }).withMessage("Invalid order"),

    body("order_item_id")
        .optional()
        .isInt({ gt: 0 }).withMessage("Invalid order item"),

    body("type")
        .notEmpty().withMessage("Dispute type is required")
        .isIn(DISPUTE_TYPES).withMessage(`Type must be one of: ${DISPUTE_TYPES.join(", ")}`),

    body("subject")
        .trim()
        .notEmpty().withMessage("Subject is required")
        .isLength({ max: 150 }).withMessage("Subject must be under 150 characters"),

    body("description")
        .trim()
        .notEmpty().withMessage("Description is required")
        .isLength({ max: 2000 }).withMessage("Description must be under 2000 characters")
];

exports.disputeIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid dispute")
];

exports.messageValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid dispute"),
    body("message")
        .trim()
        .notEmpty().withMessage("Message can't be empty")
        .isLength({ max: 2000 }).withMessage("Message must be under 2000 characters")
];

exports.resolveValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid dispute"),

    body("resolution")
        .notEmpty().withMessage("Resolution is required")
        .isIn(RESOLUTIONS).withMessage(`Resolution must be one of: ${RESOLUTIONS.join(", ")}`),

    body("resolution_note")
        .optional()
        .isString()
        .isLength({ max: 1000 }).withMessage("Note must be under 1000 characters"),

    body("refund_amount")
        .optional()
        .isFloat({ gt: 0 }).withMessage("Refund amount must be a positive number")
];

exports.rejectValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid dispute"),

    body("resolution_note")
        .trim()
        .notEmpty().withMessage("A reason is required to reject a dispute")
        .isLength({ max: 1000 }).withMessage("Reason must be under 1000 characters")
];
