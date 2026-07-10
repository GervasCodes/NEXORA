const db = require("../../config/db");

// Find Seller by User ID
exports.findByUserId = async (userId) => {

    const [rows] = await db.query(
        `SELECT sp.*, st.name AS store_type_name
        FROM seller_profiles sp
        LEFT JOIN store_types st ON st.id = sp.store_type_id
        WHERE sp.user_id = ?`,
        [userId]
    );

    return rows[0];
};

// Create Seller Profile
exports.create = async (sellerData) => {

    const {
        user_id,
        store_name,
        store_slug,
        store_description,
        store_type_id
    } = sellerData;

    const [result] = await db.query(
        `INSERT INTO seller_profiles
        (user_id, store_name, store_slug, store_description, store_type_id)
        VALUES (?, ?, ?, ?, ?)`,
        [
            user_id,
            store_name,
            store_slug,
            store_description,
            store_type_id || null
        ]
    );

    return result.insertId;
};

// Update Seller Profile
exports.update = async (userId, data) => {

    const fields = [];
    const params = [];

    const allowed = [
        "store_name", "store_description", "business_email",
        "business_phone", "country", "region", "city", "address", "store_type_id"
    ];

    for (const key of allowed) {
        if (data[key] !== undefined) {
            fields.push(`${key} = ?`);
            params.push(data[key]);
        }
    }

    if (fields.length === 0) return;

    params.push(userId);

    await db.query(
        `UPDATE seller_profiles SET ${fields.join(", ")} WHERE user_id = ?`,
        params
    );
};

exports.updateLogo = async (userId, logoUrl) => {
    await db.query(
        "UPDATE seller_profiles SET store_logo = ? WHERE user_id = ?",
        [logoUrl, userId]
    );
};

exports.updateBanner = async (userId, bannerUrl) => {
    await db.query(
        "UPDATE seller_profiles SET store_banner = ? WHERE user_id = ?",
        [bannerUrl, userId]
    );
};
// --- Seller's own delivery agent roster (their hired staff) ---

exports.findAgentByEmail = async (email) => {
    const [rows] = await db.query(
        "SELECT id, first_name, last_name, email, role FROM users WHERE email = ?",
        [email]
    );
    return rows[0];
};

exports.findRoster = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT sda.id, sda.agent_id, sda.created_at,
                u.first_name, u.last_name, u.email
        FROM seller_delivery_agents sda
        JOIN users u ON u.id = sda.agent_id
        WHERE sda.seller_id = ?
        ORDER BY sda.created_at DESC`,
        [sellerId]
    );
    return rows;
};

exports.isInRoster = async (sellerId, agentId) => {
    const [rows] = await db.query(
        "SELECT id FROM seller_delivery_agents WHERE seller_id = ? AND agent_id = ?",
        [sellerId, agentId]
    );
    return rows.length > 0;
};

exports.addToRoster = async (sellerId, agentId) => {
    const [result] = await db.query(
        "INSERT INTO seller_delivery_agents (seller_id, agent_id) VALUES (?, ?)",
        [sellerId, agentId]
    );
    return result.insertId;
};

exports.removeFromRoster = async (sellerId, agentId) => {
    const [result] = await db.query(
        "DELETE FROM seller_delivery_agents WHERE seller_id = ? AND agent_id = ?",
        [sellerId, agentId]
    );
    return result.affectedRows;
};

// --- Analytics ---

exports.getOrderTotals = async (sellerId) => {
    const [[row]] = await db.query(
        `SELECT
            COUNT(DISTINCT oi.order_id) AS total_orders,
            COALESCE(SUM(oi.subtotal), 0) AS gross_sales,
            COALESCE(SUM(CASE WHEN oi.wallet_credited THEN oi.commission_amount ELSE 0 END), 0) AS commission_paid,
            COALESCE(SUM(CASE WHEN oi.wallet_credited THEN oi.seller_net_amount ELSE 0 END), 0) AS net_earnings
        FROM order_items oi
        WHERE oi.seller_id = ?`,
        [sellerId]
    );
    return row;
};

exports.getOrderStatusBreakdown = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT o.status, COUNT(DISTINCT o.id) AS count
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE oi.seller_id = ?
        GROUP BY o.status`,
        [sellerId]
    );
    return rows;
};

// Gross sales per day for the last N days - powers a simple sales chart.
exports.getDailySales = async (sellerId, days = 30) => {
    const [rows] = await db.query(
        `SELECT DATE(o.created_at) AS day, COALESCE(SUM(oi.subtotal), 0) AS amount
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.seller_id = ? AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(o.created_at)
        ORDER BY day ASC`,
        [sellerId, days]
    );
    return rows;
};

exports.getTopProducts = async (sellerId, limit = 5) => {
    const [rows] = await db.query(
        `SELECT p.id, p.name, p.slug,
                SUM(oi.quantity) AS units_sold,
                SUM(oi.subtotal) AS revenue
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.seller_id = ?
        GROUP BY p.id, p.name, p.slug
        ORDER BY units_sold DESC
        LIMIT ?`,
        [sellerId, limit]
    );
    return rows;
};

// Buyers who've placed more than one order containing this seller's items.
exports.getRepeatCustomerCount = async (sellerId) => {
    const [[row]] = await db.query(
        `SELECT COUNT(*) AS repeat_customers FROM (
            SELECT o.buyer_id
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.seller_id = ?
            GROUP BY o.buyer_id
            HAVING COUNT(DISTINCT o.id) > 1
        ) t`,
        [sellerId]
    );
    return row.repeat_customers;
};
