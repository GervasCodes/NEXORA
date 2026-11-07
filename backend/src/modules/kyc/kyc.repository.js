const db = require("../../config/db");

exports.getTierLimits = async () => {
    const [rows] = await db.query("SELECT tier, max_order_amount, label FROM kyc_tier_limits");
    return rows;
};

exports.getTierLimit = async (tier) => {
    const [rows] = await db.query(
        "SELECT tier, max_order_amount, label FROM kyc_tier_limits WHERE tier = ?",
        [tier]
    );
    return rows[0];
};

// Cash on Delivery caps (Phase 2) - max_cod_order_amount falls back to
// max_order_amount in kyc.service.js when NULL, so this always returns
// both columns even for a tier that hasn't been given a stricter COD cap.
exports.getCodTierLimit = async (tier) => {
    const [rows] = await db.query(
        "SELECT tier, max_order_amount, max_cod_order_amount, max_unpaid_cod_orders FROM kyc_tier_limits WHERE tier = ?",
        [tier]
    );
    return rows[0];
};

// How many of this buyer's Cash on Delivery orders are still "in flight" -
// not yet delivered+confirmed, and not cancelled. Counts the parent order
// only for a multi-vendor cart (child orders share the parent's payment) to
// avoid over-counting one checkout as several COD orders.
exports.countUnpaidCodOrders = async (buyerId) => {
    const [[row]] = await db.query(
        `SELECT COUNT(*) AS count FROM orders
        WHERE buyer_id = ? AND payment_method = 'cash_on_delivery'
            AND status != 'cancelled'
            AND (buyer_confirmed_at IS NULL)
            AND parent_order_id IS NULL`,
        [buyerId]
    );
    return Number(row.count);
};

exports.getRefusedCodCount = async (userId) => {
    const [rows] = await db.query("SELECT refused_cod_count FROM users WHERE id = ?", [userId]);
    return rows[0] ? Number(rows[0].refused_cod_count) : 0;
};

exports.incrementRefusedCodCount = async (userId) => {
    await db.query("UPDATE users SET refused_cod_count = refused_cod_count + 1 WHERE id = ?", [userId]);
};

exports.getUserTier = async (userId) => {
    const [rows] = await db.query("SELECT kyc_tier FROM users WHERE id = ?", [userId]);
    return rows[0] ? rows[0].kyc_tier : null;
};

exports.setUserTier = async (userId, tier) => {
    await db.query("UPDATE users SET kyc_tier = ? WHERE id = ?", [tier, userId]);
};

exports.findPendingRequestForUser = async (userId) => {
    const [rows] = await db.query(
        "SELECT * FROM kyc_upgrade_requests WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
        [userId]
    );
    return rows[0];
};

exports.findLatestRequestForUser = async (userId) => {
    const [rows] = await db.query(
        "SELECT * FROM kyc_upgrade_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        [userId]
    );
    return rows[0];
};

exports.createRequest = async ({ userId, targetTier, documentType, stored, note }) => {
    const [result] = await db.query(
        `INSERT INTO kyc_upgrade_requests
            (user_id, target_tier, document_type, file_public_id, file_resource_type, file_format, file_storage, note, status)
        VALUES (?, ?, ?, ?, ?, ?, 'authenticated', ?, 'pending')`,
        [userId, targetTier, documentType, stored.publicId, stored.resourceType, stored.format, note || null]
    );
    return result.insertId;
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM kyc_upgrade_requests WHERE id = ?", [id]);
    return rows[0];
};

exports.findByFilter = async ({ status = "pending" } = {}) => {
    const [rows] = await db.query(
        `SELECT r.*, u.first_name, u.last_name, u.email, u.phone
        FROM kyc_upgrade_requests r
        JOIN users u ON u.id = r.user_id
        WHERE r.status = ?
        ORDER BY r.created_at ASC`,
        [status]
    );
    return rows;
};

exports.setRequestStatus = async (id, status, { rejectionReason = null, reviewedBy } = {}) => {
    await db.query(
        `UPDATE kyc_upgrade_requests
        SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW()
        WHERE id = ?`,
        [status, rejectionReason, reviewedBy || null, id]
    );
};
