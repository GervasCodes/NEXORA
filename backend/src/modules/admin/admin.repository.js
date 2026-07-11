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
                sp.country, sp.region, sp.city, sp.is_verified, sp.verification_status,
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

// --- Seller verification review ---

exports.findPendingVerifications = async () => {
    const [rows] = await db.query(
        `SELECT sp.user_id, sp.store_name, sp.store_slug, sp.verification_status,
                sp.verification_submitted_at, sp.verification_fee_paid,
                u.first_name, u.last_name, u.email, u.phone
        FROM seller_profiles sp
        JOIN users u ON u.id = sp.user_id
        WHERE sp.verification_status = 'pending'
        ORDER BY sp.verification_submitted_at ASC`
    );
    return rows;
};

exports.findVerificationDocuments = async (sellerUserId) => {
    const [rows] = await db.query(
        `SELECT id, document_type, file_url, uploaded_at
        FROM seller_verification_documents
        WHERE seller_id = ?
        ORDER BY uploaded_at DESC`,
        [sellerUserId]
    );
    return rows;
};

exports.setSellerVerificationStatus = async (sellerUserId, status, rejectionReason = null) => {
    await db.query(
        `UPDATE seller_profiles
        SET verification_status = ?, verification_rejection_reason = ?, verification_reviewed_at = NOW()
        WHERE user_id = ?`,
        [status, rejectionReason, sellerUserId]
    );
};

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
