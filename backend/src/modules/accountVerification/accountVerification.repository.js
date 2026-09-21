const db = require("../../config/db");

// Everyone currently awaiting review, or filtered to one status/role.
// Defaults to pending so the admin inbox view doesn't require query params.
exports.findByFilter = async ({ status = "pending", role } = {}) => {
    const conditions = ["account_verification_status = ?"];
    const params = [status];

    if (role) {
        conditions.push("role = ?");
        params.push(role);
    } else {
        conditions.push("role IN ('seller', 'delivery_agent')");
    }

    const [rows] = await db.query(
        `SELECT id, first_name, last_name, email, phone, role,
                account_verification_status, account_verification_rejection_reason,
                account_verification_submitted_at, account_verification_reviewed_at
        FROM users
        WHERE ${conditions.join(" AND ")}
        ORDER BY account_verification_submitted_at ASC`,
        params
    );

    return rows;
};

exports.findUserById = async (userId) => {
    const [rows] = await db.query(
        `SELECT id, first_name, last_name, email, phone, role,
                account_verification_status, account_verification_rejection_reason,
                account_verification_submitted_at, account_verification_reviewed_at,
                account_verification_reviewed_by, verification_tier,
                vehicle_type, vehicle_plate_number
        FROM users WHERE id = ?`,
        [userId]
    );
    return rows[0];
};

exports.findDocumentsByUser = async (userId) => {
    const [rows] = await db.query(
        `SELECT id, document_type, file_url, uploaded_at
        FROM account_verification_documents
        WHERE user_id = ? AND business_request_id IS NULL
        ORDER BY uploaded_at ASC`,
        [userId]
    );
    return rows;
};

exports.findHistoryByUser = async (userId) => {
    const [rows] = await db.query(
        `SELECT h.id, h.action, h.reason, h.created_at,
                a.first_name AS actor_first_name, a.last_name AS actor_last_name
        FROM account_verification_history h
        LEFT JOIN users a ON a.id = h.actor_admin_id
        WHERE h.user_id = ?
        ORDER BY h.created_at ASC`,
        [userId]
    );
    return rows;
};

exports.setStatus = async (userId, status, { reason = null, actorAdminId = null } = {}) => {
    await db.query(
        `UPDATE users
        SET account_verification_status = ?,
            account_verification_rejection_reason = ?,
            account_verification_reviewed_at = NOW(),
            account_verification_reviewed_by = ?
        WHERE id = ?`,
        [status, reason, actorAdminId, userId]
    );
};

exports.insertHistory = async (userId, action, reason, actorAdminId, conn = db) => {
    await conn.query(
        "INSERT INTO account_verification_history (user_id, action, reason, actor_admin_id) VALUES (?, ?, ?, ?)",
        [userId, action, reason || null, actorAdminId || null]
    );
};

// Base approval is what makes a seller "id_verified". Only ever moves
// none -> id_verified: it must never demote an account that has already
// reached business_verified.
exports.promoteToIdVerified = async (userId) => {
    await db.query(
        "UPDATE users SET verification_tier = 'id_verified' WHERE id = ? AND verification_tier = 'none'",
        [userId]
    );
};

// --- Verified Business tier-upgrade requests ---

const BUSINESS_REQUEST_COLUMNS = `r.id, r.user_id, r.status, r.rejection_reason,
        r.submitted_at, r.reviewed_at, r.reviewed_by`;

// Serializes concurrent submissions from the same seller: whoever holds
// this lock does the pending-check + insert atomically.
exports.lockUser = async (userId, conn) => {
    const [rows] = await conn.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
    return rows[0];
};

exports.findPendingBusinessRequestByUser = async (userId, conn = db) => {
    const [rows] = await conn.query(
        `SELECT ${BUSINESS_REQUEST_COLUMNS}
        FROM business_verification_requests r
        WHERE r.user_id = ? AND r.status = 'pending'
        LIMIT 1`,
        [userId]
    );
    return rows[0];
};

exports.findLatestBusinessRequestByUser = async (userId) => {
    const [rows] = await db.query(
        `SELECT ${BUSINESS_REQUEST_COLUMNS}
        FROM business_verification_requests r
        WHERE r.user_id = ?
        ORDER BY r.id DESC
        LIMIT 1`,
        [userId]
    );
    return rows[0];
};

exports.findBusinessRequestById = async (requestId, conn = db) => {
    const [rows] = await conn.query(
        `SELECT ${BUSINESS_REQUEST_COLUMNS},
                u.first_name, u.last_name, u.email, u.phone, u.verification_tier,
                sp.store_name
        FROM business_verification_requests r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN seller_profiles sp ON sp.user_id = r.user_id
        WHERE r.id = ?`,
        [requestId]
    );
    return rows[0];
};

exports.findBusinessRequestsByStatus = async (status = "pending") => {
    const [rows] = await db.query(
        `SELECT ${BUSINESS_REQUEST_COLUMNS},
                u.first_name, u.last_name, u.email, u.phone,
                sp.store_name
        FROM business_verification_requests r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN seller_profiles sp ON sp.user_id = r.user_id
        WHERE r.status = ?
        ORDER BY r.submitted_at ASC`,
        [status]
    );
    return rows;
};

exports.insertBusinessRequest = async (userId, conn) => {
    const [result] = await conn.query(
        "INSERT INTO business_verification_requests (user_id) VALUES (?)",
        [userId]
    );
    return result.insertId;
};

exports.insertBusinessDocument = async (userId, requestId, documentType, fileUrl, conn) => {
    await conn.query(
        `INSERT INTO account_verification_documents (user_id, business_request_id, document_type, file_url)
        VALUES (?, ?, ?, ?)`,
        [userId, requestId, documentType, fileUrl]
    );
};

exports.findDocumentsByBusinessRequest = async (requestId) => {
    const [rows] = await db.query(
        `SELECT id, document_type, file_url, uploaded_at
        FROM account_verification_documents
        WHERE business_request_id = ?
        ORDER BY uploaded_at ASC`,
        [requestId]
    );
    return rows;
};

// Guarded on status = 'pending' so two admins reviewing the same request
// can't both "win" - the second one sees affectedRows = 0.
exports.setBusinessRequestStatus = async (requestId, status, { reason = null, actorAdminId = null } = {}, conn = db) => {
    const [result] = await conn.query(
        `UPDATE business_verification_requests
        SET status = ?, rejection_reason = ?, reviewed_at = NOW(), reviewed_by = ?
        WHERE id = ? AND status = 'pending'`,
        [status, reason, actorAdminId, requestId]
    );
    return result.affectedRows;
};

exports.setVerificationTier = async (userId, tier, conn = db) => {
    await conn.query("UPDATE users SET verification_tier = ? WHERE id = ?", [tier, userId]);
};

exports.setBusinessBadge = async (userId, isBusinessVerified, conn = db) => {
    await conn.query(
        "UPDATE seller_profiles SET is_business_verified = ? WHERE user_id = ?",
        [isBusinessVerified ? 1 : 0, userId]
    );
};
