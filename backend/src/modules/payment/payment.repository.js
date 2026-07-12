const db = require("../../config/db");

exports.findByOrderId = async (orderId) => {
    const [rows] = await db.query(
        "SELECT * FROM payments WHERE order_id = ?",
        [orderId]
    );
    return rows[0];
};

exports.create = async (orderId, method, amount) => {
    const [result] = await db.query(
        `INSERT INTO payments (order_id, method, status, amount, purpose)
        VALUES (?, ?, 'pending', ?, 'order_payment')`,
        [orderId, method, amount]
    );
    return result.insertId;
};

// Seller verification fee payments have no order - they're tied to a
// seller instead, and identified by purpose.
exports.createVerificationFeePayment = async (sellerId, amount) => {
    const [result] = await db.query(
        `INSERT INTO payments (order_id, seller_id, method, status, amount, purpose)
        VALUES (NULL, ?, 'mobile_money', 'pending', ?, 'seller_verification_fee')`,
        [sellerId, amount]
    );
    return result.insertId;
};

exports.findPendingVerificationFeePayment = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT * FROM payments
        WHERE seller_id = ? AND purpose = 'seller_verification_fee' AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1`,
        [sellerId]
    );
    return rows[0];
};

exports.markPending = async (paymentId, transactionReference) => {
    await db.query(
        `UPDATE payments
        SET status = 'pending',
            transaction_reference = ?
        WHERE id = ?`,
        [transactionReference, paymentId]
    );
};

exports.markCompleted = async (paymentId, transactionReference, receiptNumber) => {
    await db.query(
        `UPDATE payments
        SET status = 'completed',
            transaction_reference = ?,
            receipt_number = ?,
            paid_at = NOW()
        WHERE id = ?`,
        [transactionReference, receiptNumber, paymentId]
    );
};

exports.markFailed = async (paymentId) => {
    await db.query(
        "UPDATE payments SET status = 'failed' WHERE id = ?",
        [paymentId]
    );
};