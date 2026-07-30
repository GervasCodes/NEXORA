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

const RULE_TYPES = ["day_of_week", "date_range"];
const ADJUSTMENT_TYPES = ["percentage", "fixed"];

// Phase 5 (Growth) - Dynamic Pricing. Deliberately loose here (doesn't
// enforce day_of_week vs. date_range's mutually-exclusive fields the
// way migration 066's CHECK constraint does) - service.service.js's
// validatePricingRuleInput is the real gate for that, same division of
// labor createServiceValidation above already has with the service
// layer's own checks.
exports.createPricingRuleValidation = [
    body("rule_type")
        .notEmpty()
        .withMessage("Rule type is required")
        .isIn(RULE_TYPES)
        .withMessage(`Rule type must be one of: ${RULE_TYPES.join(", ")}`),

    body("adjustment_type")
        .notEmpty()
        .withMessage("Adjustment type is required")
        .isIn(ADJUSTMENT_TYPES)
        .withMessage(`Adjustment type must be one of: ${ADJUSTMENT_TYPES.join(", ")}`),

    body("adjustment_value")
        .notEmpty()
        .withMessage("Adjustment value is required")
        .isNumeric()
        .withMessage("Adjustment value must be a number"),

    body("day_of_week")
        .optional({ nullable: true })
        .isInt({ min: 0, max: 6 })
        .withMessage("day_of_week must be between 0 (Sunday) and 6 (Saturday)"),

    body("start_date")
        .optional({ nullable: true })
        .isDate()
        .withMessage("Invalid start_date"),

    body("end_date")
        .optional({ nullable: true })
        .isDate()
        .withMessage("Invalid end_date"),

    body("label")
        .optional({ nullable: true })
        .isLength({ max: 100 })
        .withMessage("Label is too long")
];
