const { body, param } = require("express-validator");

exports.createCategoryValidation = [
    body("name").notEmpty().withMessage("Category name is required"),
    body("description").optional().isString(),
    body("display_order").optional().isInt({ min: 0 }).withMessage("Display order must be a positive number")
];

exports.updateCategoryValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid category"),
    body("name").notEmpty().withMessage("Category name is required"),
    body("description").optional().isString(),
    body("display_order").optional().isInt({ min: 0 }).withMessage("Display order must be a positive number")
];

exports.categoryIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid category")
];

exports.scheduleMaintenanceValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid category"),
    body("start_at").optional({ nullable: true }).isISO8601().withMessage("Invalid start time"),
    body("end_at").optional({ nullable: true }).isISO8601().withMessage("Invalid end time"),
    body("message").optional().isString().isLength({ max: 255 }).withMessage("Message must be 255 characters or fewer")
];
