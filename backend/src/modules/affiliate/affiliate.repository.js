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

// ---- Conversions (Phase 6): pending at order time, paid after delivery and
// the return window, reversed on cancel / refund. Functions take an
// executor so settlement can run a whole order inside one transaction.

exports.findGoodsSubtotal = async (orderId) => {
    const [[row]] = await db.query(
        `SELECT COALESCE(SUM(oi.subtotal), 0) AS total
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.id = ? OR o.parent_order_id = ?`,
        [orderId, orderId]
    );
    return Number(row.total);
};

exports.hasConversionForBuyerClick = async (affiliateUserId, buyerId, clickToken) => {
    const [rows] = await db.query(
        `SELECT ac.id FROM affiliate_conversions ac
        JOIN orders o ON o.id = ac.order_id
        WHERE ac.affiliate_user_id = ? AND o.buyer_id = ? AND ac.click_token = ? AND ac.status <> 'reversed'
        LIMIT 1`,
        [affiliateUserId, buyerId, clickToken]
    );
    return rows.length > 0;
};

exports.createPendingConversion = async ({ affiliateUserId, orderId, commissionAmount, clickToken }) => {
    const [result] = await db.query(
        `INSERT INTO affiliate_conversions (affiliate_user_id, order_id, commission_amount, status, click_token)
        VALUES (?, ?, ?, 'pending', ?)`,
        [affiliateUserId, orderId, commissionAmount, clickToken]
    );
    return result.insertId;
};

exports.findConversionsForOrder = async (orderId, executor = db) => {
    const [rows] = await executor.query("SELECT * FROM affiliate_conversions WHERE order_id = ?", [orderId]);
    return rows;
};

exports.findConversionForUpdate = async (id, executor) => {
    const [rows] = await executor.query("SELECT * FROM affiliate_conversions WHERE id = ? FOR UPDATE", [id]);
    return rows[0];
};

exports.setConversionStatus = async (id, status, executor = db) => {
    await executor.query(
        "UPDATE affiliate_conversions SET status = ?, paid_at = IF(? = 'paid', NOW(), paid_at) WHERE id = ?",
        [status, status, id]
    );
};

// ---- Admin (Phase 6, items 7 and 8) ---------------------------------------

// Moves an account to `to` only if it is currently `from`. Returns whether a
// row changed, so approve and reject are idempotent.
exports.setStatusIf = async (userId, from, to, executor = db) => {
    const [result] = await executor.query(
        "UPDATE affiliate_accounts SET status = ? WHERE user_id = ? AND status = ?",
        [to, userId, from]
    );
    return result.affectedRows > 0;
};

exports.findAccountsByStatus = async (status, limit = 200) => {
    const [rows] = await db.query(
        `SELECT user_id, code, status, commission_rate, created_at
        FROM affiliate_accounts
        WHERE (? IS NULL OR status = ?)
        ORDER BY (status = 'pending') DESC, created_at DESC
        LIMIT ?`,
        [status || null, status || null, limit]
    );
    return rows;
};

exports.findConversionsForAdmin = async (limit = 200) => {
    const [rows] = await db.query(
        `SELECT id, affiliate_user_id, order_id, commission_amount, status, paid_at, created_at
        FROM affiliate_conversions
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
        [limit]
    );
    return rows;
};

// ---- Payouts (Phase 6, item 8) ---------------------------------------------

exports.hasOpenPayout = async (userId, executor = db) => {
    const [rows] = await executor.query(
        "SELECT id FROM affiliate_payouts WHERE affiliate_user_id = ? AND status = 'requested' LIMIT 1",
        [userId]
    );
    return rows.length > 0;
};

exports.insertPayout = async (
    { userId, amount, method, destination },
    executor = db
) => {
    const [result] = await executor.query(
        `INSERT INTO affiliate_payouts (affiliate_user_id, amount, payout_method, payout_destination)
        VALUES (?, ?, ?, ?)`,
        [userId, amount, method, destination]
    );
    return result.insertId;
};

exports.findPayoutForUpdate = async (id, executor = db) => {
    const [rows] = await executor.query(
        "SELECT * FROM affiliate_payouts WHERE id = ? FOR UPDATE",
        [id]
    );
    return rows[0];
};

exports.findPayoutById = async (id, executor = db) => {
    const [rows] = await executor.query("SELECT * FROM affiliate_payouts WHERE id = ?", [id]);
    return rows[0];
};

// Moves a payout from `from` to `to` only if it is still in `from`.
exports.setPayoutStatusIf = async (id, from, to, { reference = null, note = null } = {}, executor = db) => {
    const [result] = await executor.query(
        `UPDATE affiliate_payouts
        SET status = ?, payout_reference = COALESCE(?, payout_reference),
            admin_note = COALESCE(?, admin_note), resolved_at = NOW()
        WHERE id = ? AND status = ?`,
        [to, reference, note, id, from]
    );
    return result.affectedRows > 0;
};

exports.findPayoutsByStatus = async (status, limit = 200) => {
    const [rows] = await db.query(
        `SELECT id, affiliate_user_id, amount, payout_method, payout_destination, status,
                payout_reference, admin_note, requested_at, resolved_at
        FROM affiliate_payouts
        WHERE (? IS NULL OR status = ?)
        ORDER BY (status = 'requested') DESC, requested_at DESC
        LIMIT ?`,
        [status || null, status || null, limit]
    );
    return rows;
};
