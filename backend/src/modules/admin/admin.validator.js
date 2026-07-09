const { param } = require("express-validator");

exports.userIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid user")
];

exports.productIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid product")
];
