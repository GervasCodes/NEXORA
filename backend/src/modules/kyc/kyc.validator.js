const { body, param } = require("express-validator");

exports.requestUpgradeValidation = [
    body("documentType")
        .notEmpty()
        .withMessage("Document type is required"),
    body("note")
        .optional({ nullable: true })
        .isLength({ max: 500 })
        .withMessage("Note is too long")
];

exports.requestIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid request")
];

exports.rejectValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid request"),
    body("reason")
        .notEmpty()
        .withMessage("A rejection reason is required")
];
