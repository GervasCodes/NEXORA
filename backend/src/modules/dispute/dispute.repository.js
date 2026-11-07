const db = require("../../config/db");

// ---- Disputes ---------------------------------------------------------

exports.create = async ({ disputeNumber, orderId, orderItemId, buyerId, sellerId, type, subject, description }) => {
    const [result] = await db.query(
        `INSERT INTO disputes
        (dispute_number, order_id, order_item_id, buyer_id, seller_id, type, subject, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [disputeNumber, orderId, orderItemId || null, buyerId, sellerId || null, type, subject, description]
    );
    return result.insertId;
};

// Open/under_review disputes against this seller right now - used by
// wallet.service.js#requestWithdrawal to block a new withdrawal once a
// seller has too many unresolved disputes outstanding (Phase 2).
exports.countOpenBySeller = async (sellerId) => {
    const [[row]] = await db.query(
        "SELECT COUNT(*) AS count FROM disputes WHERE seller_id = ? AND status IN ('open', 'under_review')",
        [sellerId]
    );
    return Number(row.count);
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM disputes WHERE id = ?", [id]);
    return rows[0];
};

// Open disputes already filed against this exact order/item, so a buyer
// can't spam duplicate cases for the same problem.
exports.findOpenByOrderAndItem = async (orderId, orderItemId) => {
    const [rows] = await db.query(
        `SELECT id FROM disputes
        WHERE order_id = ? AND (order_item_id = ? OR (order_item_id IS NULL AND ? IS NULL))
            AND status IN ('open', 'under_review')
        LIMIT 1`,
        [orderId, orderItemId || null, orderItemId || null]
    );
    return rows[0];
};

// Every dispute filed against this order, item-specific or whole-order,
// in any status. Used by wallet.service.js#releaseEligibleEarnings
// (Phase 9D) to decide whether a held order_item is safe to release -
// see the dispute-freeze / closed-by-refund rules there.
exports.findByOrderId = async (orderId) => {
    const [rows] = await db.query(
        "SELECT id, order_item_id, status, resolution FROM disputes WHERE order_id = ?",
        [orderId]
    );
    return rows;
};

// (UI/UX remediation) - filtering + pagination, same treatment
// as order.repository.js#findOrdersByBuyer. `q` matches the dispute
// number, subject, or the order number it's against.
exports.findByBuyer = async (buyerId, { status, from, to, q, page = 1, limit = 10 } = {}) => {
    const offset = (page - 1) * limit;
    const conditions = ["d.buyer_id = ?"];
    const params = [buyerId];

    if (status) {
        conditions.push("d.status = ?");
        params.push(status);
    }
    if (from) {
        conditions.push("d.created_at >= ?");
        params.push(from);
    }
    if (to) {
        conditions.push("d.created_at <= ?");
        params.push(to);
    }
    if (q) {
        conditions.push("(d.dispute_number LIKE ? OR d.subject LIKE ? OR o.order_number LIKE ?)");
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const whereClause = conditions.join(" AND ");

    const [rows] = await db.query(
        `SELECT d.id, d.dispute_number, d.order_id, d.type, d.status, d.subject,
                d.resolution, d.refund_amount, d.created_at, d.updated_at,
                o.order_number
        FROM disputes d
        JOIN orders o ON o.id = d.order_id
        WHERE ${whereClause}
        ORDER BY d.created_at DESC
        LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total
        FROM disputes d
        JOIN orders o ON o.id = d.order_id
        WHERE ${whereClause}`,
        params
    );

    return { disputes: rows, total };
};

exports.findBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT d.id, d.dispute_number, d.order_id, d.type, d.status, d.subject,
                d.resolution, d.refund_amount, d.created_at, d.updated_at,
                o.order_number
        FROM disputes d
        JOIN orders o ON o.id = d.order_id
        WHERE d.seller_id = ?
        ORDER BY d.created_at DESC`,
        [sellerId]
    );
    return rows;
};

// Admin inbox - optionally filtered by status/type.
exports.findAll = async ({ status, type } = {}) => {
    const conditions = [];
    const params = [];

    if (status) {
        conditions.push("d.status = ?");
        params.push(status);
    }
    if (type) {
        conditions.push("d.type = ?");
        params.push(type);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await db.query(
        `SELECT d.id, d.dispute_number, d.order_id, d.type, d.status, d.subject,
                d.resolution, d.refund_amount, d.created_at, d.updated_at,
                o.order_number,
                bu.first_name AS buyer_first_name, bu.last_name AS buyer_last_name,
                su.first_name AS seller_first_name, su.last_name AS seller_last_name
        FROM disputes d
        JOIN orders o ON o.id = d.order_id
        JOIN users bu ON bu.id = d.buyer_id
        LEFT JOIN users su ON su.id = d.seller_id
        ${where}
        ORDER BY (d.status IN ('open', 'under_review')) DESC, d.created_at DESC`,
        params
    );
    return rows;
};

exports.updateStatus = async (id, status) => {
    await db.query("UPDATE disputes SET status = ? WHERE id = ?", [status, id]);
};

// SLA (Phase 5) ------------------------------------------------------------

// Set once, the first time the seller actually responds (a message, not
// just viewing the dispute) - WHERE first_response_at IS NULL makes this
// a no-op on every later seller message, so the timestamp always
// reflects the *first* response.
exports.markFirstResponse = async (id) => {
    await db.query(
        "UPDATE disputes SET first_response_at = NOW() WHERE id = ? AND first_response_at IS NULL",
        [id]
    );
};

// Open/under_review disputes older than `hours` with no seller response
// yet, and not already flagged - used by the SLA job to flag them and
// notify admins exactly once per dispute (the job flips
// seller_response_overdue so it won't re-match next tick).
exports.findOverdueForSellerResponse = async (hours) => {
    const [rows] = await db.query(
        `SELECT d.id, d.dispute_number, d.seller_id, d.order_id, o.order_number
        FROM disputes d
        JOIN orders o ON o.id = d.order_id
        WHERE d.status IN ('open', 'under_review')
            AND d.first_response_at IS NULL
            AND d.seller_response_overdue = FALSE
            AND d.created_at <= (NOW() - INTERVAL ? HOUR)`,
        [Number(hours)]
    );
    return rows;
};

exports.markSellerResponseOverdue = async (id) => {
    await db.query("UPDATE disputes SET seller_response_overdue = TRUE WHERE id = ?", [id]);
};

// Open/under_review disputes that have crossed the 12h or 20h mark and
// haven't had that specific checkpoint notification sent yet - the SLA
// reminder job notifies admins once per checkpoint, not once per tick.
// `column` is interpolated directly (not parameterized - MySQL doesn't
// allow a column name as a bound param) but is only ever called with
// the two hardcoded literals below from disputeSla.job.js, never with
// anything derived from a request.
exports.findUnnotifiedAtCheckpoint = async (hours, column) => {
    const [rows] = await db.query(
        `SELECT id, dispute_number, order_id, created_at
        FROM disputes
        WHERE status IN ('open', 'under_review')
            AND ${column} IS NULL
            AND created_at <= (NOW() - INTERVAL ? HOUR)`,
        [Number(hours)]
    );
    return rows;
};

exports.markCheckpointNotified = async (id, column) => {
    await db.query(`UPDATE disputes SET ${column} = NOW() WHERE id = ?`, [id]);
};

exports.resolve = async (id, { status, resolution, resolutionNote, refundAmount, resolvedBy }) => {
    await db.query(
        `UPDATE disputes
        SET status = ?, resolution = ?, resolution_note = ?, refund_amount = ?,
            resolved_by = ?, resolved_at = NOW()
        WHERE id = ?`,
        [status, resolution, resolutionNote || null, refundAmount || null, resolvedBy, id]
    );
};

// Historical precedent for one seller + dispute type - plain grouped
// count of how past RESOLVED disputes of this exact type against this
// seller were resolved. Used by Phase B3's dispute-resolution agentic
// workflow (ai.service.js#suggestDisputeResolution) as the rule-based
// fact an AI suggestion is grounded in - never a source an AI is asked
// to invent from. Excludes the dispute currently being suggested on
// (only ever resolved cases contribute), so it can't count itself.
exports.getResolutionStatsForSellerAndType = async (sellerId, type, excludeDisputeId) => {
    const [rows] = await db.query(
        `SELECT resolution, COUNT(*) AS count
        FROM disputes
        WHERE seller_id = ? AND type = ? AND status = 'resolved' AND id != ?
        GROUP BY resolution
        ORDER BY count DESC`,
        [sellerId, type, excludeDisputeId || 0]
    );
    return rows.map((r) => ({ resolution: r.resolution, count: Number(r.count) }));
};

// ---- Evidence -----------------------------------------------------------

exports.addEvidence = async (disputeId, uploadedBy, fileUrl) => {
    const [result] = await db.query(
        "INSERT INTO dispute_evidence (dispute_id, uploaded_by, file_url) VALUES (?, ?, ?)",
        [disputeId, uploadedBy, fileUrl]
    );
    return result.insertId;
};

exports.findEvidence = async (disputeId) => {
    const [rows] = await db.query(
        `SELECT id, uploaded_by, file_url, uploaded_at
        FROM dispute_evidence
        WHERE dispute_id = ?
        ORDER BY uploaded_at ASC`,
        [disputeId]
    );
    return rows;
};

// ---- Messages -------------------------------------------------------------

exports.addMessage = async (disputeId, senderId, senderRole, message) => {
    const [result] = await db.query(
        "INSERT INTO dispute_messages (dispute_id, sender_id, sender_role, message) VALUES (?, ?, ?, ?)",
        [disputeId, senderId, senderRole, message]
    );
    return result.insertId;
};

exports.findMessages = async (disputeId) => {
    const [rows] = await db.query(
        `SELECT m.id, m.sender_id, m.sender_role, m.message, m.created_at,
                u.first_name, u.last_name, u.photo_url
        FROM dispute_messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.dispute_id = ?
        ORDER BY m.created_at ASC`,
        [disputeId]
    );
    return rows;
};

// ---- History (audit trail) ------------------------------------------------

exports.addHistory = async (disputeId, action, note, actorId) => {
    await db.query(
        "INSERT INTO dispute_history (dispute_id, action, note, actor_id) VALUES (?, ?, ?, ?)",
        [disputeId, action, note || null, actorId || null]
    );
};

exports.findHistory = async (disputeId) => {
    const [rows] = await db.query(
        `SELECT h.id, h.action, h.note, h.created_at,
                u.first_name, u.last_name
        FROM dispute_history h
        LEFT JOIN users u ON u.id = h.actor_id
        WHERE h.dispute_id = ?
        ORDER BY h.created_at ASC`,
        [disputeId]
    );
    return rows;
};
