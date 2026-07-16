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
