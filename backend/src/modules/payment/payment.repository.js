const db = require("../../config/db");

// Pre-order / made-to-order (Phase 8) - an order can now have more than
// one payment row (a deposit leg, then later a balance leg - see
// payment_leg on migration 106), so this returns the LATEST row for the
// order rather than "the" row. That's a no-op change for every non-
// pre-order order (still exactly one row, so "latest" = "the only one"),
// but it's what lets a completed deposit row stop shadowing the pending
// balance row that gets created after it.
exports.findByOrderId = async (orderId) => {
    const [rows] = await db.query(
        "SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1",
        [orderId]
    );
    return rows[0];
};

// paymentReference: the unique opaque per-attempt reference (see
// paymentReference.js). Optional so COD rows, which never go to a
// provider, can still be created without one.
exports.create = async (orderId, method, amount, paymentLeg = "full", paymentReference = null, executor = db) => {
    const [result] = await executor.query(
        `INSERT INTO payments (order_id, method, status, amount, purpose, payment_leg, payment_reference)
        VALUES (?, ?, 'pending', ?, 'order_payment', ?, ?)`,
        [orderId, method, amount, paymentLeg, paymentReference]
    );
    return result.insertId;
};

exports.findById = async (paymentId) => {
    const [rows] = await db.query("SELECT * FROM payments WHERE id = ?", [paymentId]);
    return rows[0];
};

// Exact match on the per-attempt reference. Case-insensitive under the
// default utf8mb4 collation, which is deliberate: a provider that
// upper/lower-cases the reference it echoes back must still match.
exports.findByPaymentReference = async (paymentReference) => {
    const [rows] = await db.query(
        "SELECT * FROM payments WHERE payment_reference = ? LIMIT 1",
        [paymentReference]
    );
    return rows[0];
};

// ---- Wallet top-up payment  -------------------------------
// Mirrors the order-payment create/find pattern above
// exactly - a top-up has no order, just a buyer (via seller_id, reused
// as "the human this payment is for" the same way it already is for a
// verification fee - see 084's migration note on `topup_id` for why a
// dedicated column was still needed) and a topup_id.

exports.createTopUpPayment = async (buyerId, topupId, amount, paymentReference = null) => {
    const [result] = await db.query(
        `INSERT INTO payments (order_id, seller_id, topup_id, method, status, amount, purpose, payment_reference)
        VALUES (NULL, ?, ?, 'mobile_money', 'pending', ?, 'wallet_topup', ?)`,
        [buyerId, topupId, amount, paymentReference]
    );
    return result.insertId;
};

// Latest row for a top-up in ANY status - a late success callback on a
// payment already marked failed must still find its row.
exports.findLatestByTopUpId = async (topupId) => {
    const [rows] = await db.query(
        `SELECT * FROM payments WHERE topup_id = ? AND purpose = 'wallet_topup'
        ORDER BY id DESC LIMIT 1`,
        [topupId]
    );
    return rows[0];
};

exports.findPendingTopUpPayment = async (topupId) => {
    const [rows] = await db.query(
        `SELECT * FROM payments WHERE topup_id = ? AND purpose = 'wallet_topup' AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1`,
        [topupId]
    );
    return rows[0];
};

// ---- Subscription payments (Revenue & Product Enhancements) ---------------
// Mirrors the order-payment create/find pattern above
// exactly - a subscription payment has no order/booking, just a seller
// and a subscription_id, the same shape as a verification fee's
// seller_id.

exports.createSubscriptionPayment = async (sellerId, subscriptionId, amount, method, paymentReference = null) => {
    const [result] = await db.query(
        `INSERT INTO payments (order_id, seller_id, subscription_id, method, status, amount, purpose, payment_reference)
        VALUES (NULL, ?, ?, ?, 'pending', ?, 'subscription_payment', ?)`,
        [sellerId, subscriptionId, method, amount, paymentReference]
    );
    return result.insertId;
};

// Marks this subscription's stale pending attempts failed. Conditional on
// status = 'pending', so it cannot overwrite a payment the webhook has
// already completed. Returns how many attempts were timed out.
exports.expireStalePendingForSubscription = async (subscriptionId, minutes) => {
    const [result] = await db.query(
        `UPDATE payments SET status = 'failed'
        WHERE subscription_id = ? AND purpose = 'subscription_payment' AND status = 'pending'
          AND created_at < NOW() - INTERVAL ? MINUTE`,
        [subscriptionId, minutes]
    );
    return result.affectedRows;
};

exports.findLatestBySubscriptionId = async (subscriptionId) => {
    const [rows] = await db.query(
        `SELECT * FROM payments WHERE subscription_id = ? AND purpose = 'subscription_payment'
        ORDER BY id DESC LIMIT 1`,
        [subscriptionId]
    );
    return rows[0];
};

exports.findPendingSubscriptionPayment = async (subscriptionId) => {
    const [rows] = await db.query(
        `SELECT * FROM payments
        WHERE subscription_id = ? AND purpose = 'subscription_payment' AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1`,
        [subscriptionId]
    );
    return rows[0];
};

// Looks up a payment by the reference stored when it was initiated
// (Snippe Checkout Session id, or PayPal order id) - used when a
// provider only gives us that id back (e.g. PayPal's capture response,
// or a frontend return-URL query param) and we need to find our own
// payment row and its order_id/seller_id/purpose.
// ---- Booking payments (Financial Integration) --------------------
// Mirrors the order-payment create/find pattern above
// exactly (see migration 064's design notes for why bookings follow the
// verification-fee shape - no predetermined payment_method column to
// check against - rather than the order shape).

exports.findByBookingId = async (bookingId) => {
    const [rows] = await db.query(
        "SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1",
        [bookingId]
    );
    return rows[0];
};

// payerPhoneEncrypted (Phase 5, P0) - only ever set for the
// mobile-money method (see payment.service.js#initiateMobileMoneyBookingPayment),
// NULL for every other method since they don't need it for a refund.
exports.createBookingPayment = async (bookingId, amount, method, paymentReference = null, payerPhoneEncrypted = null) => {
    const [result] = await db.query(
        `INSERT INTO payments (order_id, booking_id, method, status, amount, purpose, payment_reference, payer_phone_encrypted)
        VALUES (NULL, ?, ?, 'pending', ?, 'booking_payment', ?, ?)`,
        [bookingId, method, amount, paymentReference, payerPhoneEncrypted]
    );
    return result.insertId;
};

exports.findPendingBookingPayment = async (bookingId) => {
    const [rows] = await db.query(
        `SELECT * FROM payments
        WHERE booking_id = ? AND purpose = 'booking_payment' AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1`,
        [bookingId]
    );
    return rows[0];
};

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
        WHERE id = ? AND status IN ('pending', 'failed')`,
        [transactionReference, paymentId]
    );
};

// PayPal: fix what we asked PayPal to charge (USD) and the rate used, at
// creation time, so the capture can be compared with it later instead of
// re-deriving it from whatever the exchange-rate setting says by then.
exports.markPendingPaypal = async (paymentId, paypalOrderId, { expectedUsdAmount, usdExchangeRate }) => {
    await db.query(
        `UPDATE payments
        SET status = 'pending',
            transaction_reference = ?,
            expected_usd_amount = ?,
            usd_exchange_rate = ?
        WHERE id = ? AND status IN ('pending', 'failed')`,
        [paypalOrderId, expectedUsdAmount, usdExchangeRate, paymentId]
    );
};

// Atomically claims a payment as completed. Only a row that is still
// 'pending' OR 'failed' can be claimed - a late success on a payment we
// already gave up on is a real payment (see payment.service.js) - and the
// conditional UPDATE is the race guard: two deliveries of the same success
// cannot both get affectedRows = 1, so only one of them goes on to credit
// wallets / activate subscriptions. Returns true only for the winner.
//
// chargedCurrency/chargedAmount: only set for foreign-currency gateways
// (PayPal) where what was actually charged differs from payments.amount
// (always TZS) - see migration 028.
exports.claimCompleted = async (paymentId, transactionReference, receiptNumber, chargedCurrency = null, chargedAmount = null, executor = db) => {
    const [result] = await executor.query(
        `UPDATE payments
        SET status = 'completed',
            transaction_reference = COALESCE(?, transaction_reference),
            receipt_number = ?,
            paid_at = NOW(),
            charged_currency = ?,
            charged_amount = ?
        WHERE id = ? AND status IN ('pending', 'failed')`,
        [transactionReference, receiptNumber, chargedCurrency, chargedAmount, paymentId]
    );
    return result.affectedRows === 1;
};

// Unconditional completion, kept for the Cash on Delivery path where the
// row is created and completed by the same buyer-confirmation request.
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

// A completed card payment the buyer's bank reversed. Only a completed
// row can become a chargeback; returns true only for the first caller.
exports.markChargeback = async (paymentId, reason) => {
    const [result] = await db.query(
        `UPDATE payments
        SET status = 'chargeback', chargeback_at = NOW(), chargeback_reason = ?
        WHERE id = ? AND status = 'completed'`,
        [reason ? String(reason).slice(0, 255) : null, paymentId]
    );
    return result.affectedRows === 1;
};

// Payments that have been 'pending' past their cutoff with no webhook
// either way, for the staleOrders sweep. Aware of the payment's method
// (a hosted checkout session - card / PayPal - legitimately stays open far
// longer than a USSD prompt) and of its purpose (returned on every row, so
// the caller settles a top-up / subscription / booking / order payment
// through its own handler instead of blindly failing them all). COD and
// wallet rows never wait on a provider, so they are not swept here.
// Rows with an open admin review are left alone - a human is deciding.
exports.findStalePending = async ({ cutoffMinutes, hostedCutoffMinutes, limit = 500 }) => {
    const [rows] = await db.query(
        `SELECT p.* FROM payments p
        WHERE p.status = 'pending'
            AND p.method NOT IN ('cash_on_delivery', 'wallet')
            AND p.created_at < (NOW() - INTERVAL
                CASE WHEN p.method IN ('snippe', 'malipopay_card', 'paypal') THEN ? ELSE ? END MINUTE)
            AND NOT EXISTS (
                SELECT 1 FROM payment_review_queue q WHERE q.payment_id = p.id AND q.status = 'open'
            )
        ORDER BY p.id ASC
        LIMIT ?`,
        [hostedCutoffMinutes, cutoffMinutes, limit]
    );
    return rows;
};

// Wallet-method rows are only ever pending for the instant between the
// debit call and the handler - a row stuck pending for hours is dead.
exports.findStaleWalletPending = async (olderThanMinutes, limit = 200) => {
    const [rows] = await db.query(
        `SELECT * FROM payments
        WHERE status = 'pending' AND method = 'wallet'
            AND created_at < (NOW() - INTERVAL ? MINUTE)
        ORDER BY id ASC LIMIT ?`,
        [olderThanMinutes, limit]
    );
    return rows;
};

// True if this order/booking already has a payment attempt that is still
// pending and was started within the last `seconds`. Uses the database
// clock on purpose (see payment.service.js#assertNoRecentPendingAttempt).
exports.hasRecentPending = async ({ orderId, bookingId }, seconds = 60) => {
    const column = orderId ? "order_id" : "booking_id";
    const [rows] = await db.query(
        `SELECT id FROM payments
        WHERE ${column} = ? AND status = 'pending'
            AND created_at > (NOW() - INTERVAL ? SECOND)
        LIMIT 1`,
        [orderId || bookingId, seconds]
    );
    return rows.length > 0;
};

exports.hasPendingForOrder = async (orderId) => {
    const [rows] = await db.query(
        "SELECT id FROM payments WHERE order_id = ? AND status = 'pending' LIMIT 1",
        [orderId]
    );
    return rows.length > 0;
};

// Every not-yet-completed provider payment from the last N days, for the
// daily "completed at provider, not completed here" reconciliation.
exports.findUnsettledForReconciliation = async (sinceDays, limit = 500) => {
    const [rows] = await db.query(
        `SELECT p.* FROM payments p
        WHERE p.status IN ('pending', 'failed')
            AND p.method NOT IN ('cash_on_delivery', 'wallet')
            AND (p.transaction_reference IS NOT NULL OR p.payment_reference IS NOT NULL)
            AND p.created_at >= (NOW() - INTERVAL ? DAY)
            AND NOT EXISTS (
                SELECT 1 FROM payment_review_queue q WHERE q.payment_id = p.id AND q.status = 'open'
            )
        ORDER BY p.id DESC
        LIMIT ?`,
        [sinceDays, limit]
    );
    return rows;
};

// Only a 'pending' row can become failed - a completed (or chargeback)
// payment must never be flipped back by a stray failure event or the
// stale sweep. Returns true only if this call changed the row.
exports.markFailed = async (paymentId) => {
    const [result] = await db.query(
        "UPDATE payments SET status = 'failed' WHERE id = ? AND status = 'pending'",
        [paymentId]
    );
    return result.affectedRows === 1;
};

// Whether the buyer's wallet was actually debited for this order - used by
// the stale sweep before it gives up on a stuck wallet payment.
exports.hasWalletDebitForOrder = async (orderId) => {
    const [rows] = await db.query(
        `SELECT id FROM buyer_wallet_transactions
        WHERE reference_type = 'order_payment' AND reference_id = ? AND type = 'debit'
        LIMIT 1`,
        [orderId]
    );
    return rows.length > 0;
};
