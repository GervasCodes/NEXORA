const { body } = require("express-validator");
const { buildPayout } = require("../../utils/payoutDetails");

exports.requestWithdrawalValidation = [
    body("amount")
        .isFloat({ gt: 0 })
        .withMessage("Enter a valid withdrawal amount"),

    // Structured payout destination: method + (network, phone) or
    // (bank name, account number, account name). One custom check runs the
    // same buildPayout() the service uses, so both layers agree.
    body("payout_method")
        .custom((value, { req }) => {
            buildPayout(req.body);
            return true;
        }),

    body("payout_currency")
        .optional()
        .isIn(["TZS", "USD"])
        .withMessage("Unsupported payout currency")
];
