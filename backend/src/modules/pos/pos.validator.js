const { body, param, query } = require("express-validator");

const productRef = [
    body("product_id").isInt({ gt: 0 }).withMessage("Choose a product"),
    body("variant_id").optional({ nullable: true }).isInt({ gt: 0 }).withMessage("Invalid variant"),
    body("idempotency_key").optional({ nullable: true }).isString().isLength({ min: 8, max: 64 })
        .withMessage("Invalid idempotency key")
];

exports.adjustmentValidation = [
    ...productRef,
    body("type").isIn(["restock", "correction"]).withMessage("Type must be restock or correction"),
    body("quantity").if(body("type").equals("restock"))
        .isInt({ min: 1, max: 1000000 }).withMessage("Restock quantity must be a whole number greater than zero"),
    body("new_stock").if(body("type").equals("correction"))
        .isInt({ min: 0, max: 1000000 }).withMessage("Counted stock must be a whole number, zero or more"),
    body("reason").optional({ nullable: true }).isString().trim().isLength({ max: 255 })
        .withMessage("Reason is too long")
];

exports.saleValidation = [
    ...productRef,
    body("quantity").isInt({ min: 1, max: 1000000 }).withMessage("Quantity must be a whole number greater than zero"),
    body("unit_price").optional({ nullable: true, checkFalsy: false }).isFloat({ min: 0, max: 1000000000 })
        .withMessage("Unit price must be zero or more"),
    body("payment_method").optional().isIn(["cash", "mobile_money", "card", "bank_transfer", "other"])
        .withMessage("Invalid payment method"),
    body("customer_name").optional({ nullable: true }).isString().trim().isLength({ max: 120 })
        .withMessage("Customer name is too long"),
    body("note").optional({ nullable: true }).isString().trim().isLength({ max: 255 })
        .withMessage("Note is too long"),
    body("sold_at").optional({ nullable: true }).isISO8601().withMessage("Invalid sale date")
];

exports.listAdjustmentsValidation = [
    query("product_id").optional().isInt({ gt: 0 }).withMessage("Invalid product"),
    query("type").optional().isIn(["restock", "correction", "offline_sale"]).withMessage("Invalid type"),
    query("page").optional().isInt({ gt: 0 }),
    query("limit").optional().isInt({ gt: 0, max: 100 })
];

exports.listSalesValidation = [
    query("product_id").optional().isInt({ gt: 0 }).withMessage("Invalid product"),
    query("from").optional().isISO8601().withMessage("Invalid from date"),
    query("to").optional().isISO8601().withMessage("Invalid to date"),
    query("page").optional().isInt({ gt: 0 }),
    query("limit").optional().isInt({ gt: 0, max: 100 })
];

exports.stockLevelsValidation = [
    query("q").optional().isString().isLength({ max: 100 }),
    query("low_stock").optional().isIn(["0", "1", "true", "false"]),
    query("threshold").optional().isInt({ min: 0, max: 100000 }),
    query("page").optional().isInt({ gt: 0 }),
    query("limit").optional().isInt({ gt: 0, max: 100 })
];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

exports.reportValidation = [
    query("from").optional().matches(DATE_ONLY).withMessage("Invalid from date"),
    query("to").optional().matches(DATE_ONLY).withMessage("Invalid to date")
];

exports.createItemValidation = [
    body("name").trim().notEmpty().withMessage("Item name is required").isLength({ max: 200 })
        .withMessage("Item name is too long"),
    body("price").isFloat({ min: 0, max: 1000000000 }).withMessage("Price must be zero or more"),
    body("initial_stock").optional({ nullable: true }).isInt({ min: 0, max: 1000000 })
        .withMessage("Opening stock must be a whole number, zero or more")
];

exports.updateItemValidation = [
    param("productId").isInt({ gt: 0 }).withMessage("Invalid item"),
    body("name").optional().trim().notEmpty().withMessage("Item name is required").isLength({ max: 200 })
        .withMessage("Item name is too long"),
    body("price").optional().isFloat({ min: 0, max: 1000000000 }).withMessage("Price must be zero or more")
];
