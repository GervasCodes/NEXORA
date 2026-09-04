const { param, body } = require("express-validator");

exports.productIdValidation = [
    param("productId").isInt({ gt: 0 }).withMessage("Invalid product")
];

exports.subscribeValidation = [
    body("type")
        .isIn(["back_in_stock", "price_drop"])
        .withMessage("Invalid alert type")
];

exports.unsubscribeValidation = [
    param("productId").isInt({ gt: 0 }).withMessage("Invalid product"),
    param("type").isIn(["back_in_stock", "price_drop"]).withMessage("Invalid alert type")
];
