const db = require("../../config/db");

// dispute_id is UNIQUE (migration 038) - this INSERT is what actually
// enforces "one automatic refund per dispute" at the DB layer, not just
// in application code. A duplicate call (double-click, retried request,
// resolveDispute() somehow invoked twice for the same dispute) hits the
// unique constraint and findByDisputeId() below is used to recover the
// existing row instead of erroring the caller.
// `disputeId` and `returnId` are now mutually exclusive source
// pointers (see migration 083) - exactly one must be passed. Both are
// still nullable/unique at the DB layer, which is what actually
// guarantees "one refund per dispute" / "one refund per return".
exports.create = async ({ disputeId, returnId, bookingId, paymentId, orderId, buyerId, sellerId, provider, amount, idempotencyKey, requestedBy }) => {
    const [result] = await db.query(
        `INSERT INTO refunds
            (dispute_id, return_id, booking_id, payment_id, order_id, buyer_id, seller_id, provider, amount, idempotency_key, requested_by, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [disputeId || null, returnId || null, bookingId || null, paymentId || null, orderId || null, buyerId, sellerId || null, provider, amount, idempotencyKey, requestedBy || null]
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

exports.findByReturnId = async (returnId) => {
    const [rows] = await db.query("SELECT * FROM refunds WHERE return_id = ?", [returnId]);
    return rows[0];
};

exports.findByBookingId = async (bookingId) => {
    const [rows] = await db.query("SELECT * FROM refunds WHERE booking_id = ?", [bookingId]);
    return rows[0];
};

// Cancellation-sourced refunds (order.service.js#cancelOrder) have no
// dedicated FK column the way dispute/return refunds do - dispute_id and
// return_id are both NULL for them. idempotency_key (UNIQUE) is what
// actually enforces "one refund per cancelled order" at the DB layer, so
// this is the lookup refund.service.js's findExistingForSource uses for
// that source type instead of a findByXId sibling.
exports.findByIdempotencyKey = async (idempotencyKey) => {
    const [rows] = await db.query("SELECT * FROM refunds WHERE idempotency_key = ?", [idempotencyKey]);
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
