const { body, param } = require("express-validator");

exports.createCategoryValidation = [
    body("name").notEmpty().withMessage("Category name is required"),
    body("description").optional().isString()
];

exports.updateCategoryValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid category"),
    body("name").notEmpty().withMessage("Category name is required"),
    body("description").optional().isString()
];

exports.categoryIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid category")
];
