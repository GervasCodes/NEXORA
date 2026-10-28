const { body, param, query } = require("express-validator");

const itemId = param("id").isInt({ gt: 0 }).withMessage("Invalid item");

const fields = [
    body("sku").optional({ nullable: true }).isString().isLength({ max: 64 }).withMessage("SKU is too long"),
    body("barcode").optional({ nullable: true }).isString().isLength({ max: 64 }).withMessage("Barcode is too long"),
    body("unit").optional({ nullable: true }).isString().isLength({ max: 20 }).withMessage("Unit is too long"),
    body("cost_price").optional({ nullable: true, checkFalsy: false }).isFloat({ min: 0, max: 1000000000 }).withMessage("Cost price must be zero or more"),
    body("sell_price").optional({ nullable: true }).isFloat({ min: 0, max: 1000000000 }).withMessage("Selling price must be zero or more"),
    body("reorder_level").optional({ nullable: true }).isInt({ min: 0, max: 100000 }).withMessage("Reorder level must be a whole number, zero or more")
];

exports.createItemValidation = [
    body("name").trim().notEmpty().withMessage("Item name is required").isLength({ max: 200 }).withMessage("Item name is too long"),
    body("opening_stock").optional({ nullable: true }).isInt({ min: 0, max: 1000000 }).withMessage("Opening stock must be a whole number, zero or more"),
    body("idempotency_key").optional({ nullable: true }).isString().isLength({ min: 8, max: 64 }).withMessage("Invalid idempotency key"),
    ...fields
];

exports.updateItemValidation = [
    itemId,
    body("name").optional().trim().notEmpty().withMessage("Item name is required").isLength({ max: 200 }).withMessage("Item name is too long"),
    ...fields
];

exports.itemIdValidation = [itemId];

exports.listItemsValidation = [
    query("q").optional().isString().isLength({ max: 100 }),
    query("source").optional().isIn(["nexora", "external"]),
    query("low").optional().isIn(["0", "1", "true", "false"]),
    query("archived").optional().isIn(["0", "1", "true", "false"]),
    query("page").optional().isInt({ gt: 0 }),
    query("limit").optional().isInt({ gt: 0, max: 100 })
];

exports.adjustValidation = [
    itemId,
    body("type").isIn(["purchase", "correction", "opening"]).withMessage("Type must be purchase, correction or opening"),
    body("quantity").if(body("type").isIn(["purchase", "opening"]))
        .isInt({ min: 1, max: 1000000 }).withMessage("Quantity must be a whole number greater than zero"),
    body("new_stock").if(body("type").equals("correction"))
        .isInt({ min: 0, max: 1000000 }).withMessage("Counted stock must be a whole number, zero or more"),
    body("baseline").optional({ nullable: true }).isInt({ min: 0, max: 1000000 }).withMessage("Invalid baseline"),
    body("unit_cost").optional({ nullable: true }).isFloat({ min: 0, max: 1000000000 }).withMessage("Unit cost must be zero or more"),
    body("reason").optional({ nullable: true }).isString().trim().isLength({ max: 255 }).withMessage("Reason is too long"),
    body("idempotency_key").optional({ nullable: true }).isString().isLength({ min: 8, max: 64 }).withMessage("Invalid idempotency key")
];

exports.listOnNexoraValidation = [
    itemId,
    body("category_id").optional({ nullable: true }).isInt({ gt: 0 }).withMessage("Invalid category")
];

exports.listMovementsValidation = [
    query("item_id").optional().isInt({ gt: 0 }),
    query("type").optional().isIn(["purchase", "sale", "order_deduct", "order_restore", "return", "void", "correction", "opening"]),
    query("from").optional().isISO8601(),
    query("to").optional().isISO8601(),
    query("page").optional().isInt({ gt: 0 }),
    query("limit").optional().isInt({ gt: 0, max: 100 })
];
