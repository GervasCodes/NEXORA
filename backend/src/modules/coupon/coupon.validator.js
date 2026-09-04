const { body } = require("express-validator");

exports.validateCouponValidation = [
    body("code")
        .notEmpty()
        .withMessage("Enter a code")
        .isLength({ max: 40 })
        .withMessage("Code is too long")
];
