const db = require("../../config/db");

// Every function accepts an optional `executor` (a pool or an in-flight
// transaction connection) so the campaign services and
// subscription.service.js can run credit reads/writes inside the same
// transaction as the wallet debit / subscription activation they belong
// to - same pattern wallet.repository.js and sponsorship.repository.js
// already use.

// Idempotent: UNIQUE(subscription_id) means a second call for the same
// subscription (e.g. a replayed payment webhook re-running activation)
// is a no-op rather than a second grant.
exports.insertPeriodIfAbsent = async (
    { sellerId, subscriptionId, creditsGranted, periodStart, periodEnd },
    executor = db
) => {
    await executor.query(
        `INSERT INTO seller_sponsorship_credit_periods
        (seller_id, subscription_id, credits_granted, credits_used, period_start, period_end)
        VALUES (?, ?, ?, 0, ?, ?)
        ON DUPLICATE KEY UPDATE subscription_id = subscription_id`,
        [sellerId, subscriptionId, creditsGranted, periodStart, periodEnd]
    );
};

// The credit period belonging to the seller's currently-effective
// subscription: the same "active and still in period" rule
// subscription.repository.js#findCurrentForSeller uses, so a superseded
// (cancelled) subscription's leftover credits are never spendable. Kept
// as a plain read - the row lock is taken separately by
// findByIdForUpdate so the lock never reaches into seller_subscriptions.
exports.findCurrentPeriodId = async (sellerId, executor = db) => {
    const [rows] = await executor.query(
        `SELECT cp.id
        FROM seller_sponsorship_credit_periods cp
        JOIN seller_subscriptions ss ON ss.id = cp.subscription_id
        WHERE cp.seller_id = ? AND ss.status = 'active'
            AND (ss.current_period_end IS NULL OR ss.current_period_end >= NOW())
        ORDER BY cp.period_start DESC, cp.id DESC
        LIMIT 1`,
        [sellerId]
    );
    return rows[0] ? rows[0].id : null;
};

exports.findById = async (id, executor = db) => {
    const [rows] = await executor.query(
        "SELECT * FROM seller_sponsorship_credit_periods WHERE id = ?",
        [id]
    );
    return rows[0];
};

// Row-locks the period so two campaigns started at the same moment can't
// both read the same remaining balance and overspend it.
exports.findByIdForUpdate = async (id, executor = db) => {
    const [rows] = await executor.query(
        "SELECT * FROM seller_sponsorship_credit_periods WHERE id = ? FOR UPDATE",
        [id]
    );
    return rows[0];
};

// Guarded increment: only applies while it still fits inside the grant.
// Returns whether a row was updated, so the caller can treat "0 rows" as
// an overspend attempt instead of silently exceeding the allotment.
exports.incrementUsed = async (id, credits, executor = db) => {
    const [result] = await executor.query(
        `UPDATE seller_sponsorship_credit_periods
        SET credits_used = credits_used + ?
        WHERE id = ? AND credits_used + ? <= credits_granted`,
        [credits, id, credits]
    );
    return result.affectedRows > 0;
};
