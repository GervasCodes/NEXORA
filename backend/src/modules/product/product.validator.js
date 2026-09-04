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

// Phase 11 (UI/UX remediation) - bulk price adjustment.
exports.bulkProductPriceValidation = [
    body("ids").isArray({ min: 1 }).withMessage("At least one product must be selected"),
    body("ids.*").isInt({ gt: 0 }).withMessage("Invalid product id"),
    body("adjust_type").isIn(["percent", "flat"]).withMessage("adjust_type must be percent or flat"),
    body("adjust_value").isFloat({ min: -1000000, max: 1000000 }).withMessage("Invalid adjustment value").toFloat()
];

// Shared by the photo/video/audio reorder routes - `ids` is the full set
// of that media type's row ids in the seller's desired top-to-bottom
// order.
exports.reorderMediaValidation = [
    body("ids").isArray({ min: 1 }).withMessage("At least one item is required"),
    body("ids.*").isInt({ gt: 0 }).withMessage("Invalid id")
];