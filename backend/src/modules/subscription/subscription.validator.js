const { body, param } = require("express-validator");
const phoneValidator = require("../../validators/sharedPhoneValidator");

exports.subscribeMobileMoneyValidation = [
    body("planCode").trim().notEmpty().withMessage("Select a plan"),
    phoneValidator("phone", { optional: true })
];

exports.subscribeRedirectValidation = [
    body("planCode").trim().notEmpty().withMessage("Select a plan")
];

// subscription_plans.description is VARCHAR(255) and `features` is a JSON
// array of display bullets (see 073). The pricing page maps over
// `features` directly, so anything other than an array of short strings
// would break it - reject that here rather than storing it.
const MAX_FEATURES = 12;

const planContentRules = [
    body("description").optional({ nullable: true }).isString().bail().trim()
        .isLength({ max: 255 }).withMessage("Description must be 255 characters or fewer"),
    body("features").optional({ nullable: true })
        .isArray({ max: MAX_FEATURES }).withMessage(`Features must be a list of at most ${MAX_FEATURES} items`),
    body("features.*").isString().withMessage("Each feature must be text").bail().trim()
        .notEmpty().withMessage("Feature items can't be blank")
        .isLength({ max: 150 }).withMessage("Each feature must be 150 characters or fewer")
];

exports.createPlanValidation = [
    body("code").trim().notEmpty().isLength({ max: 30 }).withMessage("A short plan code is required"),
    body("name").trim().notEmpty().isLength({ max: 100 }).withMessage("Plan name is required"),
    body("price").isFloat({ min: 0 }).withMessage("Enter a valid price"),
    body("billingCycle").optional().isIn(["monthly", "annual"]),
    body("commissionRateOverride").optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
    body("maxActiveListings").optional({ nullable: true }).isInt({ min: 1 }),
    body("sponsorshipCreditsPerMonth").optional().isInt({ min: 0, max: 1000 }),
    body("sortOrder").optional().isInt({ min: 0, max: 10000 }),
    ...planContentRules
];

exports.updatePlanValidation = [
    param("id").isInt().withMessage("Invalid plan id"),
    body("name").optional().trim().notEmpty().withMessage("Plan name can't be blank").isLength({ max: 100 }).withMessage("Plan name must be 100 characters or fewer"),
    body("price").optional().isFloat({ min: 0 }),
    body("billingCycle").optional().isIn(["monthly", "annual"]),
    body("commissionRateOverride").optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
    body("maxActiveListings").optional({ nullable: true }).isInt({ min: 1 }),
    body("sponsorshipCreditsPerMonth").optional().isInt({ min: 0, max: 1000 }),
    body("isActive").optional().isBoolean(),
    ...planContentRules
];
