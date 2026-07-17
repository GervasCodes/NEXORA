const db = require("../../config/db");

// --- Users ---
exports.findAllUsers = async () => {
    const [rows] = await db.query(
        `SELECT id, first_name, last_name, email, phone, role, is_active, created_at
        FROM users
        ORDER BY created_at DESC`
    );
    return rows;
};

exports.findUserById = async (userId) => {
    const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
    return rows[0];
};

exports.setUserActive = async (userId, isActive) => {
    await db.query("UPDATE users SET is_active = ? WHERE id = ?", [isActive, userId]);
};

// --- Sellers ---
exports.findAllSellers = async () => {
    const [rows] = await db.query(
        `SELECT sp.id AS profile_id, sp.user_id, sp.store_name, sp.store_slug,
                sp.country, sp.region, sp.city, sp.is_verified,
                u.first_name, u.last_name, u.email, u.is_active
        FROM seller_profiles sp
        JOIN users u ON u.id = sp.user_id
        ORDER BY sp.is_verified ASC, sp.id DESC`
    );
    return rows;
};

exports.findSellerProfileByUserId = async (userId) => {
    const [rows] = await db.query(
        "SELECT * FROM seller_profiles WHERE user_id = ?",
        [userId]
    );
    return rows[0];
};

exports.setSellerVerified = async (userId, isVerified) => {
    await db.query(
        "UPDATE seller_profiles SET is_verified = ? WHERE user_id = ?",
        [isVerified, userId]
    );
};

// --- Products ---
exports.findAllProducts = async () => {
    const [rows] = await db.query(
        `SELECT p.id, p.name, p.slug, p.price, p.stock, p.is_active, p.created_at,
                sp.store_name
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        ORDER BY p.created_at DESC
        LIMIT 200`
    );
    return rows;
};

exports.findProductById = async (productId) => {
    const [rows] = await db.query("SELECT * FROM products WHERE id = ?", [productId]);
    return rows[0];
};

exports.setProductActive = async (productId, isActive) => {
    await db.query("UPDATE products SET is_active = ? WHERE id = ?", [isActive, productId]);
};

// --- Orders (platform-wide view) ---
exports.findAllOrders = async () => {
    const [rows] = await db.query(
        `SELECT o.id, o.order_number, o.status, o.payment_status, o.payment_method,
                o.total_amount, o.created_at,
                u.first_name, u.last_name, u.email
        FROM orders o
        JOIN users u ON u.id = o.buyer_id
        ORDER BY o.created_at DESC
        LIMIT 200`
    );
    return rows;
};

// --- Dashboard ---
exports.getDashboardStats = async () => {
    const [[userCounts]] = await db.query(
        `SELECT
            SUM(role = 'buyer') AS buyers,
            SUM(role = 'seller') AS sellers,
            SUM(role = 'delivery_agent') AS delivery_agents
        FROM users`
    );

    const [[orderCounts]] = await db.query(
        `SELECT
            COUNT(*) AS total_orders,
            SUM(status = 'pending') AS pending_orders,
            SUM(status = 'delivered') AS delivered_orders,
            SUM(status = 'cancelled') AS cancelled_orders
        FROM orders`
    );

    const [[revenue]] = await db.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_revenue
        FROM orders
        WHERE payment_status = 'paid'`
    );

    const [[productCounts]] = await db.query(
        `SELECT COUNT(*) AS total_products, SUM(is_active = 1) AS active_products
        FROM products`
    );

    return { userCounts, orderCounts, revenue, productCounts };
};

// --- Analytics: daily sales, top products, top sellers ---

// Revenue/order-count per day for the last N days, paid orders only.
// Doesn't fill in gap days with zero sales - admin.service.js does that,
// since it's just JS array work and keeps this a single simple query.
exports.getDailySales = async (days) => {
    const [rows] = await db.query(
        `SELECT DATE(created_at) AS day,
                COALESCE(SUM(total_amount), 0) AS revenue,
                COUNT(*) AS order_count
        FROM orders
        WHERE payment_status = 'paid' AND created_at >= (NOW() - INTERVAL ? DAY)
        GROUP BY DATE(created_at)
        ORDER BY day ASC`,
        [days]
    );
    return rows;
};

exports.getTopProducts = async (limit) => {
    const [rows] = await db.query(
        `SELECT p.id, p.name, p.slug, sp.store_name,
                SUM(oi.quantity) AS units_sold,
                SUM(oi.subtotal) AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        WHERE o.payment_status = 'paid'
        GROUP BY p.id, p.name, p.slug, sp.store_name
        ORDER BY revenue DESC
        LIMIT ?`,
        [limit]
    );
    return rows;
};

exports.getTopSellers = async (limit) => {
    const [rows] = await db.query(
        `SELECT sp.user_id, sp.store_name, sp.is_verified,
                SUM(oi.subtotal) AS revenue,
                COUNT(DISTINCT oi.order_id) AS order_count
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN seller_profiles sp ON sp.user_id = oi.seller_id
        WHERE o.payment_status = 'paid'
        GROUP BY sp.user_id, sp.store_name, sp.is_verified
        ORDER BY revenue DESC
        LIMIT ?`,
        [limit]
    );
    return rows;
};

// Old seller document-verification review queries lived here
// (findPendingVerifications / findVerificationDocuments /
// setSellerVerificationStatus) - removed along with
// seller_verification_documents (migration 029); see accountVerification
// module for the centralized replacement.

// --- Admin management (super admin only) ---

exports.findAllAdmins = async () => {
    const [rows] = await db.query(
        `SELECT id, first_name, last_name, email, phone, admin_level, is_active, created_at
        FROM users
        WHERE role = 'admin'
        ORDER BY admin_level = 'super_admin' DESC, created_at ASC`
    );
    return rows;
};

exports.countSuperAdmins = async () => {
    const [[row]] = await db.query(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND admin_level = 'super_admin' AND is_active = TRUE"
    );
    return row.count;
};

exports.createAdmin = async ({ first_name, last_name, email, phone, password, admin_level }) => {
    const [result] = await db.query(
        `INSERT INTO users (first_name, last_name, email, phone, password, role, admin_level)
        VALUES (?, ?, ?, ?, ?, 'admin', ?)`,
        [first_name, last_name, email, phone, password, admin_level]
    );
    return result.insertId;
};

exports.updateAdminLevel = async (userId, adminLevel) => {
    await db.query(
        "UPDATE users SET admin_level = ? WHERE id = ? AND role = 'admin'",
        [adminLevel, userId]
    );
};

// Revokes admin access rather than hard-deleting the account, so audit
// trails (who approved what) stay intact.
exports.revokeAdmin = async (userId) => {
    await db.query(
        "UPDATE users SET role = 'buyer', admin_level = NULL WHERE id = ? AND role = 'admin'",
        [userId]
    );
};
