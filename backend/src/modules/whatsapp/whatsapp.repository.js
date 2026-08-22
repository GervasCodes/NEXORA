const db = require("../../config/db");

// ---- Session state (the webhook bot's "what did I last show them") ----

exports.getSession = async (phone) => {
    const [rows] = await db.query("SELECT * FROM whatsapp_sessions WHERE phone = ?", [phone]);
    if (!rows[0]) return { phone, state: "idle", context: {} };
    return { ...rows[0], context: rows[0].context || {} };
};

exports.setSession = async (phone, state, context = {}) => {
    await db.query(
        `INSERT INTO whatsapp_sessions (phone, state, context)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE state = VALUES(state), context = VALUES(context)`,
        [phone, state, JSON.stringify(context)]
    );
};

// ---- User lookups (match a WhatsApp sender to a NEXORA account) --------

exports.findUserByPhone = async (phone) => {
    const [rows] = await db.query(
        "SELECT id, first_name, whatsapp_order_updates FROM users WHERE phone = ?",
        [phone]
    );
    return rows[0];
};

exports.setWhatsAppOptIn = async (userId, optIn) => {
    await db.query("UPDATE users SET whatsapp_order_updates = ? WHERE id = ?", [optIn ? 1 : 0, userId]);
};

// Buyer identity is confirmed by requiring the order's own shipping
// phone to match the WhatsApp sender - a bare order number alone isn't
// proof of ownership.
exports.findOrderByNumberAndPhone = async (orderNumber, phone) => {
    const [rows] = await db.query(
        "SELECT order_number, status, total_amount, created_at FROM orders WHERE order_number = ? AND shipping_phone = ?",
        [orderNumber, phone]
    );
    return rows[0];
};
