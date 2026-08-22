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

exports.createRequest = async ({ userId, targetTier, documentType, fileUrl, note }) => {
    const [result] = await db.query(
        `INSERT INTO kyc_upgrade_requests (user_id, target_tier, document_type, file_url, note, status)
        VALUES (?, ?, ?, ?, ?, 'pending')`,
        [userId, targetTier, documentType, fileUrl, note || null]
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
