const { param } = require("express-validator");

exports.orderIdValidation = [
    param("orderId").isInt({ gt: 0 }).withMessage("Invalid order")
];

exports.bookingIdValidation = [
    param("bookingId").isInt({ gt: 0 }).withMessage("Invalid booking")
];
