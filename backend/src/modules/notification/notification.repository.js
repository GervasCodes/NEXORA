const db = require("../../config/db");

exports.create = async (userId, type, title, message, relatedOrderId) => {
    const [result] = await db.query(
        `INSERT INTO notifications (user_id, type, title, message, related_order_id)
        VALUES (?, ?, ?, ?, ?)`,
        [userId, type, title, message, relatedOrderId || null]
    );
    return result.insertId;
};

exports.findByUser = async (userId) => {
    const [rows] = await db.query(
        `SELECT * FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 100`,
        [userId]
    );
    return rows;
};

exports.countUnread = async (userId) => {
    const [rows] = await db.query(
        "SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0",
        [userId]
    );
    return rows[0].unread;
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM notifications WHERE id = ?", [id]);
    return rows[0];
};

exports.markAsRead = async (id) => {
    await db.query("UPDATE notifications SET is_read = 1 WHERE id = ?", [id]);
};

exports.markAllAsRead = async (userId) => {
    await db.query("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [userId]);
};

exports.remove = async (id) => {
    await db.query("DELETE FROM notifications WHERE id = ?", [id]);
};

exports.getUserEmail = async (userId) => {
    const [rows] = await db.query("SELECT email FROM users WHERE id = ?", [userId]);
    return rows[0]?.email;
};
