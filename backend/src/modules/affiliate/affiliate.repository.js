const db = require("../../config/db");
const crypto = require("crypto");

exports.findByUserId = async (userId) => {
    const [rows] = await db.query("SELECT * FROM affiliate_accounts WHERE user_id = ?", [userId]);
    return rows[0];
};

exports.findByCode = async (code) => {
    const [rows] = await db.query("SELECT * FROM affiliate_accounts WHERE code = ? AND status = 'active'", [code]);
    return rows[0];
};

exports.create = async (userId, code) => {
    await db.query("INSERT INTO affiliate_accounts (user_id, code) VALUES (?, ?)", [userId, code]);
};

exports.codeExists = async (code) => {
    const [rows] = await db.query("SELECT user_id FROM affiliate_accounts WHERE code = ?", [code]);
    return Boolean(rows[0]);
};

// ---- Clicks ---------------------------------------------------------------

exports.recordClick = async (affiliateUserId, landingPath) => {
    const clickToken = crypto.randomBytes(16).toString("hex");
    await db.query(
        "INSERT INTO affiliate_clicks (affiliate_user_id, click_token, landing_path) VALUES (?, ?, ?)",
        [affiliateUserId, clickToken, landingPath || null]
    );
    return clickToken;
};

exports.findClickByToken = async (clickToken) => {
    const [rows] = await db.query("SELECT * FROM affiliate_clicks WHERE click_token = ?", [clickToken]);
    return rows[0];
};

exports.countClicks = async (affiliateUserId) => {
    const [rows] = await db.query(
        "SELECT COUNT(*) AS count FROM affiliate_clicks WHERE affiliate_user_id = ?",
        [affiliateUserId]
    );
    return rows[0].count;
};

// ---- Conversions ------------------------------------------------------------

exports.createConversion = async (affiliateUserId, orderId, commissionAmount) => {
    const [result] = await db.query(
        `INSERT INTO affiliate_conversions (affiliate_user_id, order_id, commission_amount)
        VALUES (?, ?, ?)`,
        [affiliateUserId, orderId, commissionAmount]
    );
    return result.insertId;
};

exports.findConversionByOrder = async (orderId) => {
    const [rows] = await db.query("SELECT * FROM affiliate_conversions WHERE order_id = ?", [orderId]);
    return rows[0];
};

exports.markConversionPaid = async (id) => {
    await db.query("UPDATE affiliate_conversions SET status = 'paid', paid_at = NOW() WHERE id = ?", [id]);
};

exports.findConversionsByAffiliate = async (affiliateUserId) => {
    const [rows] = await db.query(
        `SELECT c.*, o.order_number
        FROM affiliate_conversions c
        JOIN orders o ON o.id = c.order_id
        WHERE c.affiliate_user_id = ?
        ORDER BY c.created_at DESC`,
        [affiliateUserId]
    );
    return rows;
};

exports.sumEarnings = async (affiliateUserId) => {
    const [rows] = await db.query(
        "SELECT COALESCE(SUM(commission_amount), 0) AS total FROM affiliate_conversions WHERE affiliate_user_id = ?",
        [affiliateUserId]
    );
    return Number(rows[0].total);
};
