const db = require("../../config/db");

exports.findBuyerName = async (buyerId) => {
    const [rows] = await db.query("SELECT first_name, last_name FROM users WHERE id = ?", [buyerId]);
    if (!rows[0]) return null;
    return `${rows[0].first_name} ${rows[0].last_name || ""}`.trim();
};

// ---- Seller tax registration (lives on seller_profiles) ----------------

exports.getSellerTaxInfo = async (userId) => {
    const [rows] = await db.query(
        "SELECT user_id, tin, vrn, efd_registered, efd_verified_at FROM seller_profiles WHERE user_id = ?",
        [userId]
    );
    return rows[0];
};

exports.setTaxInfo = async (userId, tin, vrn) => {
    // Re-submitting TIN/VRN resets efd_registered - a changed TIN is a
    // materially different registration and needs re-verification, not
    // a silent carry-over of the previous approval.
    await db.query(
        "UPDATE seller_profiles SET tin = ?, vrn = ?, efd_registered = 0, efd_verified_at = NULL WHERE user_id = ?",
        [tin, vrn || null, userId]
    );
};

exports.setEfdRegistered = async (userId, verified) => {
    await db.query(
        "UPDATE seller_profiles SET efd_registered = ?, efd_verified_at = ? WHERE user_id = ?",
        [verified ? 1 : 0, verified ? new Date() : null, userId]
    );
};

// Sellers who've submitted a TIN but aren't verified yet - the admin
// review queue.
exports.findPendingRegistrations = async () => {
    const [rows] = await db.query(
        `SELECT sp.user_id, sp.store_name, sp.tin, sp.vrn, u.email
        FROM seller_profiles sp
        JOIN users u ON u.id = sp.user_id
        WHERE sp.tin IS NOT NULL AND sp.efd_registered = 0
        ORDER BY sp.updated_at ASC`
    );
    return rows;
};

// ---- Fiscal receipts ----------------------------------------------------

exports.findByOrderId = async (orderId) => {
    const [rows] = await db.query("SELECT * FROM efd_receipts WHERE order_id = ?", [orderId]);
    return rows[0];
};

exports.findBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT r.*, o.order_number
        FROM efd_receipts r
        JOIN orders o ON o.id = r.order_id
        WHERE r.seller_id = ?
        ORDER BY r.created_at DESC`,
        [sellerId]
    );
    return rows;
};

exports.create = async (orderId, sellerId, status) => {
    const [result] = await db.query(
        `INSERT INTO efd_receipts (order_id, seller_id, status, submitted_at)
        VALUES (?, ?, ?, NOW())`,
        [orderId, sellerId, status]
    );
    return result.insertId;
};

exports.markIssued = async (id, { fiscalReceiptNumber, verificationCode, rawResponse }) => {
    await db.query(
        `UPDATE efd_receipts
        SET status = 'issued', fiscal_receipt_number = ?, verification_code = ?, raw_response = ?, issued_at = NOW()
        WHERE id = ?`,
        [fiscalReceiptNumber, verificationCode, JSON.stringify(rawResponse || {}), id]
    );
};

exports.markFailed = async (id, errorMessage) => {
    await db.query(
        "UPDATE efd_receipts SET status = 'failed', error_message = ? WHERE id = ?",
        [errorMessage, id]
    );
};
