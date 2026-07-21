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
// parent_order_id IS NULL: top-level orders only (standalone + parents).
// A split cart's child orders carry their own slice of the total and
// exist so vendors/delivery can track them independently - listing them
// here too would show the same cart's money twice.
exports.findAllOrders = async () => {
    const [rows] = await db.query(
        `SELECT o.id, o.order_number, o.status, o.payment_status, o.payment_method,
                o.total_amount, o.created_at, o.is_parent,
                u.first_name, u.last_name, u.email
        FROM orders o
        JOIN users u ON u.id = o.buyer_id
        WHERE o.parent_order_id IS NULL
        ORDER BY o.created_at DESC
        LIMIT 200`
    );
    return rows;
};

// --- Dispatch dashboard (Phase 6) ---

// All deliveries not yet in a terminal state (delivered/failed), with
// enough order + agent detail for the dispatch board's list/map view.
// `minutes_elapsed` / `is_delayed` are computed in SQL rather than in JS
// so this stays a single round trip - `estimated_duration_minutes` is the
// road-routing ETA snapshot taken at assignment time (see
// delivery.repository.js's `create` for why it's a frozen snapshot, not
// a live value): a delivery is flagged delayed once more real minutes
// have passed since assignment than that snapshot allowed for.
exports.findActiveDeliveries = async () => {
    const [rows] = await db.query(
        `SELECT d.id, d.order_id, d.agent_id, d.status, d.delivery_fee,
                d.distance_km, d.estimated_duration_minutes, d.assigned_at,
                d.picked_up_at, d.in_transit_at,
                TIMESTAMPDIFF(MINUTE, d.assigned_at, NOW()) AS minutes_elapsed,
                (d.estimated_duration_minutes IS NOT NULL
                    AND TIMESTAMPDIFF(MINUTE, d.assigned_at, NOW()) > d.estimated_duration_minutes
                ) AS is_delayed,
                o.order_number, o.shipping_address, o.shipping_city, o.shipping_region,
                o.delivery_lat, o.delivery_lng,
                u.first_name AS agent_first_name, u.last_name AS agent_last_name,
                u.phone AS agent_phone, u.vehicle_type AS agent_vehicle_type,
                u.current_lat AS agent_current_lat, u.current_lng AS agent_current_lng,
                u.location_updated_at AS agent_location_updated_at
        FROM deliveries d
        JOIN orders o ON o.id = d.order_id
        JOIN users u ON u.id = d.agent_id
        WHERE d.status NOT IN ('delivered', 'failed')
        ORDER BY is_delayed DESC, d.assigned_at ASC`
    );
    return rows;
};

// Every delivery agent currently marked online, plus how many active
// (not delivered/failed) deliveries they're carrying right now, so the
// dashboard can show idle vs busy agents at a glance without a second
// query per agent.
exports.findOnlineAgents = async () => {
    const [rows] = await db.query(
        `SELECT u.id, u.first_name, u.last_name, u.phone, u.vehicle_type,
                u.current_lat, u.current_lng, u.location_updated_at,
                COUNT(d.id) AS active_delivery_count
        FROM users u
        LEFT JOIN deliveries d
            ON d.agent_id = u.id AND d.status NOT IN ('delivered', 'failed')
        WHERE u.role = 'delivery_agent' AND u.is_online = TRUE
        GROUP BY u.id
        ORDER BY active_delivery_count ASC, u.first_name ASC`
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
        FROM orders
        WHERE parent_order_id IS NULL`
    );

    const [[revenue]] = await db.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_revenue
        FROM orders
        WHERE payment_status = 'paid' AND parent_order_id IS NULL`
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
        WHERE payment_status = 'paid' AND parent_order_id IS NULL AND created_at >= (NOW() - INTERVAL ? DAY)
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
