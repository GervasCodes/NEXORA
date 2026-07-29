const { body } = require("express-validator");

const PRICING_MODELS = ["fixed", "per_night", "per_hour", "per_day", "per_person"];

exports.createServiceValidation = [
    body("title")
        .notEmpty()
        .withMessage("Service title is required")
        .isLength({ min: 3, max: 200 })
        .withMessage("Service title must be between 3 and 200 characters"),

    body("base_price")
        .notEmpty()
        .withMessage("Base price is required")
        .isNumeric()
        .withMessage("Base price must be a number"),

    body("category_id")
        .optional({ nullable: true })
        .isInt({ gt: 0 })
        .withMessage("Invalid service category"),

    body("pricing_model")
        .optional()
        .isIn(PRICING_MODELS)
        .withMessage(`Pricing model must be one of: ${PRICING_MODELS.join(", ")}`),

    body("discount_price")
        .optional({ nullable: true })
        .isNumeric()
        .withMessage("Discount price must be a number"),

    body("lat")
        .optional({ nullable: true })
        .isFloat({ min: -90, max: 90 })
        .withMessage("Invalid latitude"),

    body("lng")
        .optional({ nullable: true })
        .isFloat({ min: -180, max: 180 })
        .withMessage("Invalid longitude")
];
