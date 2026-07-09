const { param } = require("express-validator");

exports.orderIdValidation = [
    param("orderId").isInt({ gt: 0 }).withMessage("Invalid order")
];
