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
    const phone = overrides.phone || `+2557${String(Date.now()).slice(-8)}${++counter}`;

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

    // A real seller always has a seller_profiles row (created at registration), and
    // several repositories INNER JOIN it - for example the cart query used by
    // checkout. Without it a seller's products silently vanish from carts.
    // Pass `withSellerProfile: false` to test the "no profile" edge case.
    if (role === "seller" && overrides.withSellerProfile !== false) {
        await db.query(
            "INSERT INTO seller_profiles (user_id, store_name, store_slug) VALUES (?, ?, ?)",
            [result.insertId, overrides.store_name || "Test Store", unique("store")]
        );
    }

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

// Addition - used by orders.checkout.db.test.js to seed a buyer's
// cart directly (bypassing cart.service, since these tests care about
// order.service.checkout's own DB writes, not how the cart got items).
exports.createCartItem = async (userId, productId, quantity = 1) => {
    const [result] = await db.query(
        "INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)",
        [userId, productId, quantity]
    );
    return { id: result.insertId };
};

// Addition - used by refund.autoRefundForDispute.db.test.js
// (and reusable by future dispute-flow tests) to seed a completed
// payment row for an order.
exports.createPayment = async (orderId, overrides = {}) => {
    const [result] = await db.query(
        `INSERT INTO payments (order_id, method, status, amount, transaction_reference)
        VALUES (?, ?, ?, ?, ?)`,
        [
            orderId,
            overrides.method || "mobile_money",
            overrides.status || "completed",
            overrides.amount ?? 1000,
            overrides.transaction_reference ?? null
        ]
    );
    return { id: result.insertId };
};

// Addition - used by refund.autoRefundForDispute.db.test.js to
// seed a resolved (refund_full/refund_partial) dispute directly, since
// those tests exercise refund.service against a dispute that's already
// past the resolution step (dispute.service.resolveDispute's own DB
// writes are covered separately by tests/unit/dispute).
exports.createDispute = async (orderId, buyerId, sellerId, overrides = {}) => {
    const disputeNumber = overrides.dispute_number || unique("DSP");

    const [result] = await db.query(
        `INSERT INTO disputes
        (dispute_number, order_id, buyer_id, seller_id, type, status, subject, description,
         resolution, refund_amount, resolved_by, resolved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            disputeNumber,
            orderId,
            buyerId,
            sellerId ?? null,
            overrides.type || "damaged_item",
            overrides.status || "resolved",
            overrides.subject || "Item arrived damaged",
            overrides.description || "The item was damaged in transit.",
            overrides.resolution || "refund_full",
            overrides.refund_amount ?? 1000,
            overrides.resolved_by ?? null,
            overrides.resolved_at === undefined ? new Date() : overrides.resolved_at
        ]
    );

    return { id: result.insertId, disputeNumber };
};

// Additions - used by admin.accountManagement.db.test.js and
// chat.messaging.db.test.js.
exports.createConversation = async (buyerId, sellerId, overrides = {}) => {
    const [result] = await db.query(
        "INSERT INTO conversations (buyer_id, seller_id, product_id) VALUES (?, ?, ?)",
        [buyerId, sellerId, overrides.product_id ?? null]
    );
    return { id: result.insertId };
};

exports.createMessage = async (conversationId, senderId, overrides = {}) => {
    const [result] = await db.query(
        "INSERT INTO messages (conversation_id, sender_id, message) VALUES (?, ?, ?)",
        [conversationId, senderId, overrides.message || "Hello there"]
    );
    return { id: result.insertId };
};

// Deletes in FK-safe (child-before-parent) order. Truncate isn't used
// since these tables have foreign keys to users/products that would
// need FK checks disabled - plain DELETE keeps this safe by default and
// this suite's fixture volume per test is small enough that it's fast.
// Tables whose rows are written by the migrations themselves (reference data
// the application needs to work). Everything else is cleared between tests.
// If a future migration seeds another table, add it here (the db-integration
// suite will fail loudly with missing reference data if you forget).
const MIGRATION_SEEDED_TABLES = new Set([
    "schema_migrations",
    "kyc_tier_limits",
    "fuel_reference",
    "delivery_eta_adjustments",
    "platform_settings",
    "subscription_plans",
    "platform_modules",
    "store_types",
    "delivery_rate_cards",
    "service_categories"
]);

let cachedTableNames = null;

// Clears every table except the migration-seeded ones. The table list is read
// from information_schema, so a table added by a later migration (for example
// the stock_* tables, whose foreign key to users used to make cleanup fail)
// is covered automatically. Foreign key checks are switched off on one
// dedicated connection for the clear, so no table ordering is needed.
exports.resetTables = async () => {
    if (!cachedTableNames) {
        const [rows] = await db.query(
            "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
        );
        cachedTableNames = rows.map((row) => row.name || row.NAME || row.TABLE_NAME)
            .filter((name) => name && !MIGRATION_SEEDED_TABLES.has(name));
    }

    const connection = await db.getConnection();
    try {
        await connection.query("SET FOREIGN_KEY_CHECKS = 0");
        for (const table of cachedTableNames) {
            await connection.query(`DELETE FROM \`${table}\``);
        }
    } finally {
        try { await connection.query("SET FOREIGN_KEY_CHECKS = 1"); } finally { connection.release(); }
    }
};

exports.waitForRows = async (query, params, { timeoutMs = 2000, intervalMs = 50 } = {}) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const [rows] = await db.query(query, params);
        if (rows.length > 0) return rows;
        if (Date.now() > deadline) return rows;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
};

exports.closePool = async () => {
    await db.end();
};

// admin.service.js's suspendUser/unsuspendUser/permanentlyDeleteUser and
// chat.service.js's sendMessage all call their respective notification
// service's notify() without awaiting it (deliberately - the calling
// request shouldn't block on a socket broadcast/web-push/email send).
// That means the notifications/admin_notifications row it writes can
// land a moment after the service call above it already resolved. Polls
// briefly instead of assuming either a fixed sleep or an immediate write.
exports.waitForRows = async (query, params, { timeoutMs = 2000, intervalMs = 50 } = {}) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const [rows] = await db.query(query, params);
        if (rows.length > 0) return rows;
        if (Date.now() > deadline) return rows;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
};
