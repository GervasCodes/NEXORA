const { body, param, query } = require("express-validator");

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

exports.registerValidation = [
    body("name").trim().notEmpty().withMessage("Business name is required")
        .isLength({ max: 120 }).withMessage("Business name is too long")
];

exports.addAgentValidation = [
    body("email").trim().isEmail().withMessage("Enter a valid email")
];

exports.agentIdValidation = [
    param("agentId").isInt({ gt: 0 }).withMessage("Invalid agent")
];

exports.createJobValidation = [
    body("pickup_address").trim().notEmpty().withMessage("Pickup address is required").isLength({ max: 255 }),
    body("dropoff_address").trim().notEmpty().withMessage("Drop-off address is required").isLength({ max: 255 }),
    body("customer_name").trim().notEmpty().withMessage("Customer name is required").isLength({ max: 120 }),
    body("customer_phone").optional({ nullable: true }).trim().isLength({ max: 30 }),
    body("reference").optional({ nullable: true }).trim().isLength({ max: 40 }),
    body("description").optional({ nullable: true }).trim().isLength({ max: 255 }),
    body("fee_amount").optional({ nullable: true, checkFalsy: false }).isFloat({ min: 0, max: 1000000000 })
        .withMessage("Fee must be zero or more")
];

exports.jobIdValidation = [
    param("jobId").isInt({ gt: 0 }).withMessage("Invalid job")
];

exports.assignValidation = [
    ...exports.jobIdValidation,
    body("agent_id").optional({ nullable: true }).isInt({ gt: 0 }).withMessage("Invalid agent")
];

exports.statusValidation = [
    ...exports.jobIdValidation,
    body("status").isIn(["picked_up", "delivered", "cancelled"]).withMessage("Invalid status")
];

exports.feeValidation = [
    ...exports.jobIdValidation,
    body("fee_amount").optional({ nullable: true }).isFloat({ min: 0, max: 1000000000 })
        .withMessage("Fee must be zero or more"),
    body("collected").optional({ nullable: true }).isBoolean().withMessage("collected must be true or false")
];

exports.listJobsValidation = [
    query("status").optional().isIn(["created", "assigned", "picked_up", "delivered", "cancelled"]),
    query("agent_id").optional().isInt({ gt: 0 }),
    query("page").optional().isInt({ gt: 0 }),
    query("limit").optional().isInt({ gt: 0, max: 100 })
];

exports.overviewValidation = [
    query("from").optional().matches(DATE_ONLY).withMessage("Invalid from date"),
    query("to").optional().matches(DATE_ONLY).withMessage("Invalid to date")
];
