// Fixture + cleanup helpers shared by the db-integration suite. Every
// helper here runs against the REAL pool (src/config/db.js) - there is no
// mock in this suite. Each test file is responsible for calling
// resetTables() in a beforeEach so tests don't leak fixtures into each
// other despite sharing one long-lived database.

const db = require("../../../src/config/db");

let counter = 0;
// Cheap per-process uniqueness for columns with UNIQUE constraints
// (email, phone, order_number, slug) without needing a real UUID lib.
const unique = (prefix) => `${prefix}-${Date.now()}-${++counter}`;

exports.createUser = async ({ role = "buyer", ...overrides } = {}) => {
    const email = overrides.email || `${unique("user")}@example.test`;
    const phone = overrides.phone || `+2557${String(Date.now()).slice(-8)}${counter}`;

    const [result] = await db.query(
        `INSERT INTO users
        (first_name, last_name, email, phone, password, role, account_verification_status)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            overrides.first_name || "Test",
            overrides.last_name || "User",
            email,
            phone,
            overrides.password || "hashed-placeholder",
            role,
            role === "seller" || role === "delivery_agent" ? "not_required" : "not_required"
        ]
    );

    return { id: result.insertId, email, phone, role };
};

// category_id is nullable, so a product fixture never needs a categories
// row - keeps the fixture graph as small as the FK constraints allow.
exports.createProduct = async (sellerId, overrides = {}) => {
    const slug = overrides.slug || unique("product");

    const [result] = await db.query(
        `INSERT INTO products (seller_id, category_id, name, slug, price, discount_price, stock, is_active)
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
        [
            sellerId,
            overrides.name || "Test Product",
            slug,
            overrides.price ?? 1000,
            overrides.discount_price ?? null,
            overrides.stock ?? 100,
            overrides.is_active ?? 1
        ]
    );

    return { id: result.insertId, price: overrides.price ?? 1000 };
};

exports.createOrder = async (buyerId, overrides = {}) => {
    const orderNumber = overrides.order_number || unique("ORD");

    const [result] = await db.query(
        `INSERT INTO orders
        (order_number, buyer_id, status, payment_status, payment_method,
         shipping_address, shipping_city, shipping_region, shipping_phone, total_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            orderNumber,
            buyerId,
            overrides.status || "processing",
            overrides.payment_status || "paid",
            overrides.payment_method || "mobile_money",
            overrides.shipping_address || "123 Test St",
            overrides.shipping_city || "Dar es Salaam",
            overrides.shipping_region || "Dar es Salaam",
            overrides.shipping_phone || "+255700000000",
            overrides.total_amount ?? 0
        ]
    );

    return { id: result.insertId, orderNumber };
};

exports.createOrderItem = async (orderId, productId, sellerId, overrides = {}) => {
    const [result] = await db.query(
        `INSERT INTO order_items (order_id, product_id, seller_id, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
            orderId,
            productId,
            sellerId,
            overrides.quantity ?? 1,
            overrides.unit_price ?? 1000,
            overrides.subtotal ?? 1000
        ]
    );

    return { id: result.insertId };
};

// Deletes in FK-safe (child-before-parent) order. Truncate isn't used
// since these tables have foreign keys to users/products that would
// need FK checks disabled - plain DELETE keeps this safe by default and
// this suite's fixture volume per test is small enough that it's fast.
exports.resetTables = async () => {
    const tables = [
        "wallet_transactions",
        "withdrawal_requests",
        "seller_wallets",
        "order_items",
        "orders",
        "account_verification_documents",
        "account_verification_history",
        "products",
        "users"
    ];

    for (const table of tables) {
        await db.query(`DELETE FROM ${table}`);
    }
};

exports.closePool = async () => {
    await db.end();
};
