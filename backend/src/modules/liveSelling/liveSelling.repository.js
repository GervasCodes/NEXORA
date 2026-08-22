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
