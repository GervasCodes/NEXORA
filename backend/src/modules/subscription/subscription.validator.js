const { body, param } = require("express-validator");
const phoneValidator = require("../../validators/sharedPhoneValidator");

exports.subscribeMobileMoneyValidation = [
    body("planCode").trim().notEmpty().withMessage("Select a plan"),
    phoneValidator("phone", { optional: true })
];

exports.subscribeRedirectValidation = [
    body("planCode").trim().notEmpty().withMessage("Select a plan")
];

exports.createPlanValidation = [
    body("code").trim().notEmpty().isLength({ max: 30 }).withMessage("A short plan code is required"),
    body("name").trim().notEmpty().isLength({ max: 100 }).withMessage("Plan name is required"),
    body("price").isFloat({ min: 0 }).withMessage("Enter a valid price"),
    body("billingCycle").optional().isIn(["monthly", "annual"]),
    body("commissionRateOverride").optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
    body("maxActiveListings").optional({ nullable: true }).isInt({ min: 1 })
];

exports.updatePlanValidation = [
    param("id").isInt().withMessage("Invalid plan id"),
    body("price").optional().isFloat({ min: 0 }),
    body("billingCycle").optional().isIn(["monthly", "annual"]),
    body("commissionRateOverride").optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
    body("maxActiveListings").optional({ nullable: true }).isInt({ min: 1 }),
    body("isActive").optional().isBoolean()
];
