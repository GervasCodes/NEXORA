const db = require("../../config/db");

exports.create = async (sellerId, { title, description, externalLink, scheduledAt }) => {
    const [result] = await db.query(
        `INSERT INTO live_selling_sessions (seller_id, title, description, external_link, scheduled_at)
        VALUES (?, ?, ?, ?, ?)`,
        [sellerId, title, description || null, externalLink, scheduledAt]
    );
    return result.insertId;
};

exports.findById = async (id) => {
    const [rows] = await db.query(
        `SELECT s.*, sp.store_name
        FROM live_selling_sessions s
        JOIN seller_profiles sp ON sp.user_id = s.seller_id
        WHERE s.id = ?`,
        [id]
    );
    return rows[0];
};

exports.findUpcoming = async () => {
    const [rows] = await db.query(
        `SELECT s.*, sp.store_name
        FROM live_selling_sessions s
        JOIN seller_profiles sp ON sp.user_id = s.seller_id
        WHERE s.status IN ('scheduled', 'live') AND s.scheduled_at > NOW() - INTERVAL 4 HOUR
        ORDER BY s.scheduled_at ASC`
    );
    return rows;
};

exports.findBySeller = async (sellerId) => {
    const [rows] = await db.query(
        "SELECT * FROM live_selling_sessions WHERE seller_id = ? ORDER BY scheduled_at DESC",
        [sellerId]
    );
    return rows;
};

exports.setStatus = async (id, status) => {
    await db.query("UPDATE live_selling_sessions SET status = ? WHERE id = ?", [status, id]);
};

// Reminders (Phase 9, UI/UX remediation) - "notify me" for a scheduled
// session, fired when its status flips to 'live' (see
// liveSelling.service.js#setStatus).
exports.subscribeReminder = async (userId, sessionId) => {
    await db.query(
        "INSERT IGNORE INTO live_selling_reminders (user_id, session_id) VALUES (?, ?)",
        [userId, sessionId]
    );
};

exports.unsubscribeReminder = async (userId, sessionId) => {
    await db.query(
        "DELETE FROM live_selling_reminders WHERE user_id = ? AND session_id = ?",
        [userId, sessionId]
    );
};

exports.isReminderSubscribed = async (userId, sessionId) => {
    const [rows] = await db.query(
        "SELECT id FROM live_selling_reminders WHERE user_id = ? AND session_id = ? LIMIT 1",
        [userId, sessionId]
    );
    return rows.length > 0;
};

exports.findPendingReminders = async (sessionId) => {
    const [rows] = await db.query(
        "SELECT * FROM live_selling_reminders WHERE session_id = ? AND notified_at IS NULL",
        [sessionId]
    );
    return rows;
};

exports.markRemindersNotified = async (ids) => {
    if (!ids.length) return;
    await db.query(
        "UPDATE live_selling_reminders SET notified_at = NOW() WHERE id IN (?)",
        [ids]
    );
};
