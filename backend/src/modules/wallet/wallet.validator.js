const { body } = require("express-validator");

exports.requestWithdrawalValidation = [
    body("amount")
        .isFloat({ gt: 0 })
        .withMessage("Enter a valid withdrawal amount"),

    body("payout_method")
        .trim()
        .notEmpty()
        .withMessage("Select a payout method")
        .isLength({ max: 50 })
        .withMessage("Payout method is too long"),

    body("payout_details")
        .trim()
        .notEmpty()
        .withMessage("Payout details (e.g. mobile money number) are required")
        .isLength({ max: 255 })
        .withMessage("Payout details are too long")
];
