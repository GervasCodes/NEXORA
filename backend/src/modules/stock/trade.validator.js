const { body, param, query } = require("express-validator");

// Phase 7 validators. The services re-check everything (amounts, ownership, stock);
// these catch malformed input early with a clear message.

const idParam = (name = "id") => param(name).isInt({ gt: 0 }).withMessage("Invalid id");
const methods = ["cash", "mobile_money", "card", "bank_transfer", "credit", "other"];
const moneyMethods = ["cash", "mobile_money", "card", "bank_transfer", "other"];
const key = body("idempotency_key").optional({ nullable: true }).isString().isLength({ min: 8, max: 64 }).withMessage("Invalid idempotency key");
const amount = (name, label) => body(name).optional({ nullable: true, checkFalsy: false }).isFloat({ min: 0, max: 1000000000 }).withMessage(`${label} must be zero or more`);

exports.idValidation = [idParam()];

exports.lookupValidation = [
    query("q").optional().isString().isLength({ max: 100 }),
    query("limit").optional().isInt({ gt: 0, max: 50 })
];

exports.createSaleValidation = [
    body("lines").isArray({ min: 1, max: 100 }).withMessage("Add at least one item to the sale"),
    body("lines.*.item_id").isInt({ gt: 0 }).withMessage("Choose an item for every line"),
    body("lines.*.quantity").isInt({ min: 1, max: 1000000 }).withMessage("Quantity must be a whole number greater than zero"),
    body("lines.*.unit_price").optional({ nullable: true }).isFloat({ min: 0, max: 1000000000 }).withMessage("Unit price must be zero or more"),
    amount("discount", "Discount"),
    amount("amount_paid", "Amount paid"),
    body("payment_method").optional().isIn(methods).withMessage("Choose how the customer is paying"),
    body("paid_via").optional({ nullable: true }).isIn(moneyMethods).withMessage("Invalid payment method"),
    body("customer_id").optional({ nullable: true }).isInt({ gt: 0 }).withMessage("Invalid customer"),
    body("customer_name").optional({ nullable: true }).isString().isLength({ max: 120 }),
    body("note").optional({ nullable: true }).isString().isLength({ max: 255 }),
    body("sold_at").optional({ nullable: true }).isISO8601().withMessage("Invalid sale date"),
    key
];

exports.listSalesValidation = [
    query("status").optional().isIn(["active", "voided", "all"]),
    query("customer_id").optional().isInt({ gt: 0 }),
    query("method").optional().isIn(methods),
    query("owing").optional().isIn(["0", "1", "true", "false"]),
    query("q").optional().isString().isLength({ max: 100 }),
    query("from").optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query("to").optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query("page").optional().isInt({ gt: 0 }),
    query("limit").optional().isInt({ gt: 0, max: 100 })
];

exports.voidSaleValidation = [
    idParam(),
    body("reason").trim().isLength({ min: 3, max: 255 }).withMessage("Give a short reason for cancelling this sale")
];

exports.returnSaleValidation = [
    idParam(),
    body("lines").isArray({ min: 1, max: 100 }).withMessage("Choose what is being returned"),
    body("lines.*.sale_line_id").isInt({ gt: 0 }).withMessage("Invalid sale line"),
    body("lines.*.quantity").isInt({ min: 1, max: 1000000 }).withMessage("Return quantity must be a whole number greater than zero"),
    body("refund_method").optional({ nullable: true }).isIn(moneyMethods).withMessage("Invalid refund method"),
    body("reason").optional({ nullable: true }).isString().isLength({ max: 255 }),
    key
];

exports.receiptValidation = [
    idParam(),
    query("lang").optional().isIn(["en", "sw"])
];

exports.createPurchaseValidation = [
    body("lines").isArray({ min: 1, max: 100 }).withMessage("Add at least one item to the purchase"),
    body("lines.*.item_id").isInt({ gt: 0 }).withMessage("Choose an item for every line"),
    body("lines.*.quantity").isInt({ min: 1, max: 1000000 }).withMessage("Quantity must be a whole number greater than zero"),
    body("lines.*.unit_cost").isFloat({ min: 0, max: 1000000000 }).withMessage("Unit cost must be zero or more"),
    body("supplier_id").optional({ nullable: true }).isInt({ gt: 0 }).withMessage("Invalid supplier"),
    body("supplier_name").optional({ nullable: true }).isString().isLength({ max: 120 }),
    body("invoice_no").optional({ nullable: true }).isString().isLength({ max: 60 }),
    amount("amount_paid", "Amount paid"),
    body("payment_method").optional().isIn(moneyMethods).withMessage("Invalid payment method"),
    body("purchased_at").optional({ nullable: true }).isISO8601().withMessage("Invalid purchase date"),
    body("note").optional({ nullable: true }).isString().isLength({ max: 255 }),
    key
];

exports.listPurchasesValidation = [
    query("supplier_id").optional().isInt({ gt: 0 }),
    query("unpaid").optional().isIn(["0", "1", "true", "false"]),
    query("q").optional().isString().isLength({ max: 100 }),
    query("from").optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query("to").optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query("page").optional().isInt({ gt: 0 }),
    query("limit").optional().isInt({ gt: 0, max: 100 })
];

exports.paymentValidation = [
    idParam(),
    body("amount").isFloat({ gt: 0, max: 1000000000 }).withMessage("Enter an amount greater than zero"),
    body("method").optional().isIn(moneyMethods).withMessage("Invalid payment method"),
    body("note").optional({ nullable: true }).isString().isLength({ max: 255 }),
    key
];

const partyFields = [
    body("phone").optional({ nullable: true }).isString().isLength({ max: 30 }).withMessage("Phone number is too long"),
    body("note").optional({ nullable: true }).isString().isLength({ max: 255 }).withMessage("Note is too long")
];
exports.createPartyValidation = [
    body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 120 }).withMessage("Name is too long"),
    ...partyFields
];
exports.updatePartyValidation = [
    idParam(),
    body("name").optional().trim().notEmpty().withMessage("Name is required").isLength({ max: 120 }).withMessage("Name is too long"),
    body("is_archived").optional().isBoolean(),
    ...partyFields
];
exports.listPartiesValidation = [
    query("q").optional().isString().isLength({ max: 100 }),
    query("owing").optional().isIn(["0", "1", "true", "false"]),
    query("archived").optional().isIn(["0", "1", "true", "false"]),
    query("page").optional().isInt({ gt: 0 }),
    query("limit").optional().isInt({ gt: 0, max: 100 })
];
