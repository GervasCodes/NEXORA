const db = require("../../config/db");

// dispute_id is UNIQUE (migration 038) - this INSERT is what actually
// enforces "one automatic refund per dispute" at the DB layer, not just
// in application code. A duplicate call (double-click, retried request,
// resolveDispute() somehow invoked twice for the same dispute) hits the
// unique constraint and findByDisputeId() below is used to recover the
// existing row instead of erroring the caller.
exports.create = async ({ disputeId, paymentId, orderId, buyerId, sellerId, provider, amount, idempotencyKey, requestedBy }) => {
    const [result] = await db.query(
        `INSERT INTO refunds
            (dispute_id, payment_id, order_id, buyer_id, seller_id, provider, amount, idempotency_key, requested_by, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [disputeId, paymentId, orderId, buyerId, sellerId || null, provider, amount, idempotencyKey, requestedBy || null]
    );
    return result.insertId;
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM refunds WHERE id = ?", [id]);
    return rows[0];
};

exports.findByDisputeId = async (disputeId) => {
    const [rows] = await db.query("SELECT * FROM refunds WHERE dispute_id = ?", [disputeId]);
    return rows[0];
};

exports.markProcessing = async (id) => {
    await db.query(
        "UPDATE refunds SET status = 'processing', attempts = attempts + 1 WHERE id = ?",
        [id]
    );
};

exports.markCompleted = async (id, providerReference) => {
    await db.query(
        `UPDATE refunds
        SET status = 'completed', provider_reference = ?, completed_at = NOW(), last_error = NULL
        WHERE id = ?`,
        [providerReference, id]
    );
};

exports.markFailed = async (id, errorMessage) => {
    await db.query(
        "UPDATE refunds SET status = 'failed', last_error = ? WHERE id = ?",
        [String(errorMessage).slice(0, 500), id]
    );
};

exports.markManualRequired = async (id, reason) => {
    await db.query(
        "UPDATE refunds SET status = 'manual_required', last_error = ? WHERE id = ?",
        [String(reason).slice(0, 500), id]
    );
};

// Used by the admin dashboard (refund.controller.js) to list/triage
// refunds, optionally filtered to a status (e.g. everything needing
// attention: 'failed' + 'manual_required').
exports.findAll = async ({ status, limit = 100 } = {}) => {
    const conditions = [];
    const params = [];

    if (status) {
        const statuses = Array.isArray(status) ? status : [status];
        conditions.push(`status IN (${statuses.map(() => "?").join(",")})`);
        params.push(...statuses);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(Number(limit));

    const [rows] = await db.query(
        `SELECT * FROM refunds ${where} ORDER BY created_at DESC LIMIT ?`,
        params
    );
    return rows;
};
