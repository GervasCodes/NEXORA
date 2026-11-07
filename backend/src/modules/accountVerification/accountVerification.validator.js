const { param, body } = require("express-validator");

exports.userIdValidation = [
    param("id").isInt().withMessage("Invalid user id")
];

exports.rejectValidation = [
    param("id").isInt().withMessage("Invalid user id"),
    body("reason")
        .trim()
        .notEmpty()
        .withMessage("A rejection reason is required")
        .isLength({ max: 255 })
        .withMessage("Reason must be under 255 characters")
];

exports.requestIdValidation = [
    param("requestId").isInt().withMessage("Invalid request id")
];

exports.rejectRequestValidation = [
    param("requestId").isInt().withMessage("Invalid request id"),
    body("reason")
        .trim()
        .notEmpty()
        .withMessage("A rejection reason is required")
        .isLength({ max: 255 })
        .withMessage("Reason must be under 255 characters")
];

exports.documentIdValidation = [
    param("docId").isInt().withMessage("Invalid document id")
];

exports.flagDocumentValidation = [
    param("docId").isInt().withMessage("Invalid document id"),
    body("reason")
        .trim()
        .notEmpty()
        .withMessage("A reason is required to flag a document")
        .isLength({ max: 255 })
        .withMessage("Reason must be under 255 characters")
];
