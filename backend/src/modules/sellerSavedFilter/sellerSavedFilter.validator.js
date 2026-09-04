const { param, body } = require("express-validator");

exports.pageKeyValidation = [
    param("pageKey").isIn(["seller_products", "seller_orders"]).withMessage("Invalid page")
];

exports.createValidation = [
    param("pageKey").isIn(["seller_products", "seller_orders"]).withMessage("Invalid page"),
    body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 60 }).withMessage("Name is too long"),
    body("filters").isObject().withMessage("filters must be an object")
];

exports.idValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid filter")
];
