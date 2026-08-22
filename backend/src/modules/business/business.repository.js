const db = require("../../config/db");

exports.getStatus = async (userId) => {
    const [rows] = await db.query(
        "SELECT business_account_status, business_name, business_tin FROM users WHERE id = ?",
        [userId]
    );
    return rows[0];
};

exports.submitApplication = async (userId, businessName, businessTin) => {
    await db.query(
        "UPDATE users SET business_account_status = 'pending', business_name = ?, business_tin = ? WHERE id = ?",
        [businessName, businessTin, userId]
    );
};

exports.setStatus = async (userId, status) => {
    await db.query("UPDATE users SET business_account_status = ? WHERE id = ?", [status, userId]);
};

exports.findPending = async () => {
    const [rows] = await db.query(
        `SELECT id, first_name, last_name, email, business_name, business_tin
        FROM users WHERE business_account_status = 'pending'
        ORDER BY id ASC`
    );
    return rows;
};

// ---- Bulk price tiers (any buyer benefits - see migration 089's
// comment on why this isn't gated behind verification) ------------------

exports.findTiersByProduct = async (productId) => {
    const [rows] = await db.query(
        "SELECT * FROM product_bulk_price_tiers WHERE product_id = ? ORDER BY min_quantity ASC",
        [productId]
    );
    return rows;
};

exports.replaceTiers = async (productId, tiers) => {
    await db.query("DELETE FROM product_bulk_price_tiers WHERE product_id = ?", [productId]);
    if (tiers.length === 0) return;

    const values = tiers.map((t) => [productId, t.minQuantity, t.unitPrice]);
    await db.query(
        "INSERT INTO product_bulk_price_tiers (product_id, min_quantity, unit_price) VALUES ?",
        [values]
    );
};
