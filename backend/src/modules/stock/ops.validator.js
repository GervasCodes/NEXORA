const { body, param, query } = require("express-validator");
const expenses = require("./expenses.service");
const importExport = require("./importExport.service");

// Phase 8 validators (expenses, reports, import / export, offline sync). The services
// re-check everything; these reject malformed input early with a clear message.

const date = (name) => query(name).optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("Dates must look like 2026-10-27");
const idParam = param("id").isInt({ gt: 0 }).withMessage("Invalid id");

exports.rangeValidation = [date("from"), date("to"), query("limit").optional().isInt({ gt: 0, max: 500 }), query("by").optional().isIn(["units", "revenue"])];
exports.dailyCloseValidation = [date("date")];

// Expenses arrive as multipart (an optional receipt photo), so fields are strings.
exports.createExpenseValidation = [
    body("category").isIn(expenses.CATEGORIES).withMessage("Choose an expense category"),
    body("amount").isFloat({ gt: 0, max: 1000000000 }).withMessage("Enter the amount spent"),
    body("expense_date").optional({ values: "falsy" }).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("Invalid date"),
    body("note").optional({ nullable: true }).isString().isLength({ max: 255 }).withMessage("Note is too long"),
    body("idempotency_key").optional({ nullable: true }).isString().isLength({ min: 8, max: 64 }).withMessage("Invalid idempotency key")
];
exports.listExpensesValidation = [
    date("from"), date("to"),
    query("category").optional().isIn(expenses.CATEGORIES),
    query("status").optional().isIn(["active", "voided", "all"]),
    query("page").optional().isInt({ gt: 0 }), query("limit").optional().isInt({ gt: 0, max: 100 })
];
exports.voidExpenseValidation = [idParam, body("reason").optional({ nullable: true }).isString().isLength({ max: 255 })];
exports.idValidation = [idParam];

exports.exportValidation = [param("kind").isIn(importExport.KINDS).withMessage("Unknown export"), date("from"), date("to")];
exports.templateValidation = [query("lang").optional().isIn(["en", "sw"])];

exports.syncValidation = [
    body("sales").isArray({ min: 1, max: 50 }).withMessage("Send between 1 and 50 sales"),
    body("sales.*.idempotency_key").isString().isLength({ min: 8, max: 64 }).withMessage("Every sale needs its request id"),
    body("sales.*.lines").isArray({ min: 1, max: 100 }).withMessage("Every sale needs at least one item"),
    body("sales.*.lines.*.item_id").isInt({ gt: 0 }),
    body("sales.*.lines.*.quantity").isInt({ min: 1, max: 1000000 }),
    body("sales.*.lines.*.unit_price").optional({ nullable: true }).isFloat({ min: 0, max: 1000000000 }),
    body("sales.*.discount").optional({ nullable: true }).isFloat({ min: 0, max: 1000000000 }),
    body("sales.*.amount_paid").optional({ nullable: true }).isFloat({ min: 0, max: 1000000000 }),
    body("sales.*.payment_method").optional().isIn(["cash", "mobile_money", "card", "bank_transfer", "credit", "other"]),
    body("sales.*.paid_via").optional({ nullable: true }).isIn(["cash", "mobile_money", "card", "bank_transfer", "other"]),
    body("sales.*.customer_id").optional({ nullable: true }).isInt({ gt: 0 }),
    body("sales.*.customer_name").optional({ nullable: true }).isString().isLength({ max: 120 }),
    body("sales.*.note").optional({ nullable: true }).isString().isLength({ max: 255 }),
    body("sales.*.sold_at").optional({ nullable: true }).isString().isLength({ max: 40 })
];
