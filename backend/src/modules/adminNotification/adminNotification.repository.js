const db = require("../../config/db");

exports.create = async ({ type, category, severity, title, message, metadata, relatedUserId }) => {
    const [result] = await db.query(
        `INSERT INTO admin_notifications (type, category, severity, title, message, metadata, related_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            type,
            category,
            severity || "info",
            title,
            message,
            metadata ? JSON.stringify(metadata) : null,
            relatedUserId || null
        ]
    );
    return result.insertId;
};

// Shared team inbox, not per-admin - see migration 059. `category` is an
// optional narrowing filter on top of the always-applied `limit`, same
// shape as audit.repository.js#findRecent's eventType/userId filters.
exports.findRecent = async ({ category, unreadOnly, limit = 100 } = {}) => {
    const conditions = [];
    const params = [];

    if (category) {
        conditions.push("category = ?");
        params.push(category);
    }
    if (unreadOnly) {
        conditions.push("is_read = 0");
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(Number(limit));

    const [rows] = await db.query(
        `SELECT * FROM admin_notifications ${where} ORDER BY created_at DESC LIMIT ?`,
        params
    );
    return rows;
};

exports.countUnread = async () => {
    const [rows] = await db.query(
        "SELECT COUNT(*) AS unread FROM admin_notifications WHERE is_read = 0"
    );
    return rows[0].unread;
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM admin_notifications WHERE id = ?", [id]);
    return rows[0];
};

exports.markAsRead = async (id, adminId) => {
    // Only records who acknowledged it if this is the read that actually
    // flips it - a second admin opening an already-read item shouldn't
    // steal credit for having been first.
    await db.query(
        `UPDATE admin_notifications
        SET is_read = 1, read_by = COALESCE(read_by, ?), read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE id = ?`,
        [adminId, id]
    );
};

exports.markAllAsRead = async (adminId) => {
    await db.query(
        `UPDATE admin_notifications
        SET is_read = 1, read_by = COALESCE(read_by, ?), read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE is_read = 0`,
        [adminId]
    );
};
