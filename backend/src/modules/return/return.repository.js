const db = require("../../config/db");

exports.create = async ({ orderId, orderItemId, buyerId, sellerId, reason, description, returnWindowDays }) => {
    const [result] = await db.query(
        `INSERT INTO order_returns
        (order_id, order_item_id, buyer_id, seller_id, reason, description, return_window_days)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, orderItemId || null, buyerId, sellerId || null, reason, description || null, returnWindowDays]
    );
    return result.insertId;
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM order_returns WHERE id = ?", [id]);
    return rows[0];
};

// An open (non-terminal) return already exists for this order/item -
// used to stop a buyer filing duplicate return requests, same idea as
// dispute.repository's findOpenByOrderAndItem.
exports.findOpenByOrderAndItem = async (orderId, orderItemId) => {
    const [rows] = await db.query(
        `SELECT id FROM order_returns
        WHERE order_id = ? AND (order_item_id = ? OR (order_item_id IS NULL AND ? IS NULL))
            AND status NOT IN ('rejected', 'refunded', 'cancelled')
        LIMIT 1`,
        [orderId, orderItemId || null, orderItemId || null]
    );
    return rows[0];
};

// Phase 4 (UI/UX remediation) - filtering + pagination, same treatment
// as order.repository.js#findOrdersByBuyer.
exports.findByBuyer = async (buyerId, { status, from, to, q, page = 1, limit = 10 } = {}) => {
    const offset = (page - 1) * limit;
    const conditions = ["r.buyer_id = ?"];
    const params = [buyerId];

    if (status) {
        conditions.push("r.status = ?");
        params.push(status);
    }
    if (from) {
        conditions.push("r.created_at >= ?");
        params.push(from);
    }
    if (to) {
        conditions.push("r.created_at <= ?");
        params.push(to);
    }
    if (q) {
        conditions.push("o.order_number LIKE ?");
        params.push(`%${q}%`);
    }

    const whereClause = conditions.join(" AND ");

    const [rows] = await db.query(
        `SELECT r.id, r.order_id, r.order_item_id, r.reason, r.status, r.refund_amount,
                r.created_at, r.updated_at, o.order_number
        FROM order_returns r
        JOIN orders o ON o.id = r.order_id
        WHERE ${whereClause}
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total
        FROM order_returns r
        JOIN orders o ON o.id = r.order_id
        WHERE ${whereClause}`,
        params
    );

    return { returns: rows, total };
};

exports.findBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT r.id, r.order_id, r.order_item_id, r.reason, r.status, r.refund_amount,
                r.created_at, r.updated_at, o.order_number
        FROM order_returns r
        JOIN orders o ON o.id = r.order_id
        WHERE r.seller_id = ?
        ORDER BY r.created_at DESC`,
        [sellerId]
    );
    return rows;
};

exports.findAll = async ({ status } = {}) => {
    const conditions = [];
    const params = [];

    if (status) {
        conditions.push("r.status = ?");
        params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await db.query(
        `SELECT r.*, o.order_number
        FROM order_returns r
        JOIN orders o ON o.id = r.order_id
        ${where}
        ORDER BY r.created_at DESC`,
        params
    );
    return rows;
};

exports.updateStatus = async (id, status, extra = {}) => {
    const fields = ["status = ?"];
    const params = [status];

    if (extra.rejectionReason !== undefined) {
        fields.push("rejection_reason = ?");
        params.push(extra.rejectionReason);
    }
    if (extra.decidedBy !== undefined) {
        fields.push("decided_by = ?", "decided_at = NOW()");
        params.push(extra.decidedBy);
    }
    if (extra.trackingNumber !== undefined) {
        fields.push("return_tracking_number = ?", "return_carrier = ?", "shipped_back_at = NOW()");
        params.push(extra.trackingNumber, extra.carrier || null);
    }
    if (extra.markReceived) {
        fields.push("received_at = NOW()");
    }
    if (extra.refundAmount !== undefined) {
        fields.push("refund_amount = ?");
        params.push(extra.refundAmount);
    }

    params.push(id);

    await db.query(`UPDATE order_returns SET ${fields.join(", ")} WHERE id = ?`, params);
};

exports.addHistory = async (returnId, action, note, actorId) => {
    await db.query(
        "INSERT INTO order_return_history (return_id, action, note, actor_id) VALUES (?, ?, ?, ?)",
        [returnId, action, note || null, actorId || null]
    );
};

exports.findHistory = async (returnId) => {
    const [rows] = await db.query(
        `SELECT h.id, h.action, h.note, h.created_at,
                a.first_name AS actor_first_name, a.last_name AS actor_last_name
        FROM order_return_history h
        LEFT JOIN users a ON a.id = h.actor_id
        WHERE h.return_id = ?
        ORDER BY h.created_at ASC`,
        [returnId]
    );
    return rows;
};

// ---- Evidence (mirrors dispute.repository.js's addEvidence/findEvidence) -

exports.addEvidence = async (returnId, uploadedBy, fileUrl) => {
    const [result] = await db.query(
        "INSERT INTO return_evidence (return_id, uploaded_by, file_url) VALUES (?, ?, ?)",
        [returnId, uploadedBy, fileUrl]
    );
    return result.insertId;
};

exports.findEvidence = async (returnId) => {
    const [rows] = await db.query(
        `SELECT id, uploaded_by, file_url, uploaded_at
        FROM return_evidence
        WHERE return_id = ?
        ORDER BY uploaded_at ASC`,
        [returnId]
    );
    return rows;
};
