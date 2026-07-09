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