const { body, param } = require("express-validator");

exports.createServiceCategoryValidation = [
    body("name").notEmpty().withMessage("Category name is required"),
    body("description").optional().isString(),
    body("display_order").optional().isInt({ min: 0 }).withMessage("Display order must be a positive number")
];

exports.updateServiceCategoryValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid service category"),
    body("name").notEmpty().withMessage("Category name is required"),
    body("description").optional().isString(),
    body("display_order").optional().isInt({ min: 0 }).withMessage("Display order must be a positive number")
];

exports.serviceCategoryIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid service category")
];
