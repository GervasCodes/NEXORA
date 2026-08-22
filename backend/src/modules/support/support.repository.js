const db = require("../../config/db");

exports.create = async ({ userId, contactPhone, subject, category }) => {
    const [result] = await db.query(
        `INSERT INTO support_tickets (user_id, contact_phone, subject, category, status)
        VALUES (?, ?, ?, ?, 'open')`,
        [userId || null, contactPhone || null, subject, category || "other"]
    );
    return result.insertId;
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM support_tickets WHERE id = ?", [id]);
    return rows[0];
};

exports.findByUser = async (userId) => {
    const [rows] = await db.query(
        "SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC",
        [userId]
    );
    return rows;
};

// Most recent still-open ticket for a phone number - used so repeated
// WhatsApp "3 - talk to support" replies append to one thread instead of
// spawning a new ticket every time (see support.service.js#createFromWhatsApp).
exports.findOpenByPhone = async (phone) => {
    const [rows] = await db.query(
        `SELECT * FROM support_tickets
        WHERE contact_phone = ? AND status IN ('open', 'pending')
        ORDER BY created_at DESC LIMIT 1`,
        [phone]
    );
    return rows[0];
};

exports.findAll = async ({ status } = {}) => {
    const conditions = [];
    const params = [];
    if (status) {
        conditions.push("t.status = ?");
        params.push(status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await db.query(
        `SELECT t.*, u.first_name, u.last_name, u.email
        FROM support_tickets t
        LEFT JOIN users u ON u.id = t.user_id
        ${where}
        ORDER BY t.updated_at DESC`,
        params
    );
    return rows;
};

exports.setStatus = async (id, status) => {
    await db.query("UPDATE support_tickets SET status = ? WHERE id = ?", [status, id]);
};

exports.touch = async (id) => {
    await db.query("UPDATE support_tickets SET updated_at = NOW() WHERE id = ?", [id]);
};

// ---- Messages -----------------------------------------------------------

exports.addMessage = async ({ ticketId, senderId, senderRole, body, attachmentUrl }) => {
    const [result] = await db.query(
        `INSERT INTO support_messages (ticket_id, sender_id, sender_role, body, attachment_url)
        VALUES (?, ?, ?, ?, ?)`,
        [ticketId, senderId || null, senderRole, body, attachmentUrl || null]
    );
    return result.insertId;
};

exports.findMessages = async (ticketId) => {
    const [rows] = await db.query(
        `SELECT m.*, u.first_name, u.last_name
        FROM support_messages m
        LEFT JOIN users u ON u.id = m.sender_id
        WHERE m.ticket_id = ?
        ORDER BY m.created_at ASC`,
        [ticketId]
    );
    return rows;
};
