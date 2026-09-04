const db = require("../../config/db");

// Phase 11 (UI/UX remediation) - saved filter views. See migration
// 101's comment for why `filters` is a generic JSON blob rather than
// typed columns.

exports.findByPage = async (sellerId, pageKey) => {
    const [rows] = await db.query(
        "SELECT id, name, filters, created_at FROM seller_saved_filters WHERE seller_id = ? AND page_key = ? ORDER BY created_at DESC",
        [sellerId, pageKey]
    );
    // mysql2 returns JSON columns already parsed into JS objects.
    return rows;
};

exports.create = async (sellerId, pageKey, name, filters) => {
    const [result] = await db.query(
        "INSERT INTO seller_saved_filters (seller_id, page_key, name, filters) VALUES (?, ?, ?, ?)",
        [sellerId, pageKey, name, JSON.stringify(filters)]
    );
    return result.insertId;
};

exports.remove = async (sellerId, id) => {
    const [result] = await db.query(
        "DELETE FROM seller_saved_filters WHERE id = ? AND seller_id = ?",
        [id, sellerId]
    );
    return result.affectedRows;
};
