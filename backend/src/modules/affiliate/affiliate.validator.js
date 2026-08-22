const { body } = require("express-validator");

exports.trackClickValidation = [
    body("code").notEmpty().isLength({ max: 20 }).withMessage("Invalid affiliate code"),
    body("path").optional({ nullable: true }).isLength({ max: 500 })
];
