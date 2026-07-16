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
                account_verification_reviewed_by
        FROM users WHERE id = ?`,
        [userId]
    );
    return rows[0];
};

exports.findDocumentsByUser = async (userId) => {
    const [rows] = await db.query(
        `SELECT id, document_type, file_url, uploaded_at
        FROM account_verification_documents
        WHERE user_id = ?
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

exports.insertHistory = async (userId, action, reason, actorAdminId) => {
    await db.query(
        "INSERT INTO account_verification_history (user_id, action, reason, actor_admin_id) VALUES (?, ?, ?, ?)",
        [userId, action, reason || null, actorAdminId || null]
    );
};
