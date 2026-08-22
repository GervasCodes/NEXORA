const { body } = require("express-validator");

exports.requestLoanValidation = [
    body("amount")
        .isFloat({ gt: 0 })
        .withMessage("A valid advance amount is required")
];
