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
// seller instead, and identified by purpose. `method` defaults to
// 'mobile_money' for backwards compatibility with existing callers, but
// Snippe/PayPal verification fee payments pass their own method.
exports.createVerificationFeePayment = async (sellerId, amount, method = "mobile_money") => {
    const [result] = await db.query(
        `INSERT INTO payments (order_id, seller_id, method, status, amount, purpose)
        VALUES (NULL, ?, ?, 'pending', ?, 'seller_verification_fee')`,
        [sellerId, method, amount]
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

// Looks up a payment by the reference stored when it was initiated
// (Snippe Checkout Session id, or PayPal order id) - used when a
// provider only gives us that id back (e.g. PayPal's capture response,
// or a frontend return-URL query param) and we need to find our own
// payment row and its order_id/seller_id/purpose.
exports.findByTransactionReference = async (transactionReference) => {
    const [rows] = await db.query(
        "SELECT * FROM payments WHERE transaction_reference = ? ORDER BY created_at DESC LIMIT 1",
        [transactionReference]
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

// chargedCurrency/chargedAmount: only set for foreign-currency gateways
// (PayPal, currently) where what was actually charged differs from
// payments.amount (always TZS) - see migration 028. Left undefined/null
// for TZS-native gateways (mobile money, Snippe, COD).
exports.markCompleted = async (paymentId, transactionReference, receiptNumber, chargedCurrency = null, chargedAmount = null) => {
    await db.query(
        `UPDATE payments
        SET status = 'completed',
            transaction_reference = ?,
            receipt_number = ?,
            paid_at = NOW(),
            charged_currency = ?,
            charged_amount = ?
        WHERE id = ?`,
        [transactionReference, receiptNumber, chargedCurrency, chargedAmount, paymentId]
    );
};

// Any payment (order or verification fee) that's been sitting 'pending'
// past the cutoff with no webhook confirmation either way - used by the
// staleOrders background job to close these out as failed instead of
// leaving them pending indefinitely.
exports.findStalePending = async (olderThanMinutes) => {
    const [rows] = await db.query(
        `SELECT * FROM payments
        WHERE status = 'pending' AND created_at < (NOW() - INTERVAL ? MINUTE)`,
        [olderThanMinutes]
    );
    return rows;
};

exports.markFailed = async (paymentId) => {
    await db.query(
        "UPDATE payments SET status = 'failed' WHERE id = ?",
        [paymentId]
    );
};