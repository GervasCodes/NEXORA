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
        `INSERT INTO payments (order_id, method, status, amount)
        VALUES (?, ?, 'pending', ?)`,
        [orderId, method, amount]
    );
    return result.insertId;
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