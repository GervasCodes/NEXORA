const { body } = require("express-validator");

exports.createProductValidation = [
    body("name")
        .notEmpty()
        .withMessage("Product name is required")
        .isLength({ min: 3 })
        .withMessage("Product name too short"),

    body("price")
        .notEmpty()
        .withMessage("Price is required")
        .isNumeric()
        .withMessage("Price must be a number"),

    body("category_id")
        .notEmpty()
        .withMessage("Category is required"),

    body("stock")
        .optional()
        .isNumeric()
        .withMessage("Stock must be a number")
];

exports.bulkProductStatusValidation = [
    body("ids").isArray({ min: 1 }).withMessage("At least one product must be selected"),
    body("ids.*").isInt({ gt: 0 }).withMessage("Invalid product id"),
    body("is_active").isBoolean().withMessage("is_active must be true or false").toBoolean()
];