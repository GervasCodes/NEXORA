const db = require("../../config/db");

exports.insertLog = async ({ userId, eventType, description, ipAddress, metadata }) => {
    await db.query(
        `INSERT INTO audit_logs (user_id, event_type, description, ip_address, metadata)
        VALUES (?, ?, ?, ?, ?)`,
        [
            userId || null,
            eventType,
            description || null,
            ipAddress || null,
            metadata ? JSON.stringify(metadata) : null
        ]
    );
};

// Used by the admin panel (see admin.repository.js pattern) to page
// through recent events, optionally filtered to one event type or user.
exports.findRecent = async ({ eventType, userId, limit = 100 } = {}) => {
    const conditions = [];
    const params = [];

    if (eventType) {
        conditions.push("event_type = ?");
        params.push(eventType);
    }
    if (userId) {
        conditions.push("user_id = ?");
        params.push(userId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(Number(limit));

    const [rows] = await db.query(
        `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ?`,
        params
    );
    return rows;
};
