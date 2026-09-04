const db = require("../../config/db");

// Phase 1 (UI/UX remediation): saved address book, so a buyer doesn't
// retype their full delivery address on every checkout. Mirrors
// wishlist.repository.js's shape (thin raw-SQL functions, one per
// operation, service layer owns any business rules).

exports.findByUser = async (userId) => {
    const [rows] = await db.query(
        `SELECT id, label, recipient_name, address, city, region, latitude, longitude, phone, is_default, created_at
         FROM buyer_addresses
         WHERE user_id = ?
         ORDER BY is_default DESC, created_at DESC`,
        [userId]
    );
    return rows;
};

exports.findById = async (id, userId) => {
    const [rows] = await db.query(
        `SELECT id, user_id, label, recipient_name, address, city, region, latitude, longitude, phone, is_default
         FROM buyer_addresses
         WHERE id = ? AND user_id = ?`,
        [id, userId]
    );
    return rows[0];
};

exports.create = async (userId, address) => {
    const [result] = await db.query(
        `INSERT INTO buyer_addresses
            (user_id, label, recipient_name, address, city, region, latitude, longitude, phone, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            address.label,
            address.recipient_name || null,
            address.address,
            address.city,
            address.region,
            address.latitude ?? null,
            address.longitude ?? null,
            address.phone,
            address.is_default ? 1 : 0
        ]
    );
    return result.insertId;
};

exports.update = async (id, userId, address) => {
    await db.query(
        `UPDATE buyer_addresses
         SET label = ?, recipient_name = ?, address = ?, city = ?, region = ?,
             latitude = ?, longitude = ?, phone = ?
         WHERE id = ? AND user_id = ?`,
        [
            address.label,
            address.recipient_name || null,
            address.address,
            address.city,
            address.region,
            address.latitude ?? null,
            address.longitude ?? null,
            address.phone,
            id,
            userId
        ]
    );
};

exports.remove = async (id, userId) => {
    const [result] = await db.query(
        "DELETE FROM buyer_addresses WHERE id = ? AND user_id = ?",
        [id, userId]
    );
    return result.affectedRows;
};

// Unsets whichever address is currently the buyer's default - called
// right before setting a new one, since only one row per buyer may have
// is_default = 1 (enforced here, not by a DB constraint - see migration
// 093's comment).
exports.clearDefault = async (userId) => {
    await db.query(
        "UPDATE buyer_addresses SET is_default = 0 WHERE user_id = ? AND is_default = 1",
        [userId]
    );
};

exports.setDefault = async (id, userId) => {
    await db.query(
        "UPDATE buyer_addresses SET is_default = 1 WHERE id = ? AND user_id = ?",
        [id, userId]
    );
};

exports.countByUser = async (userId) => {
    const [rows] = await db.query(
        "SELECT COUNT(*) AS count FROM buyer_addresses WHERE user_id = ?",
        [userId]
    );
    return rows[0].count;
};
