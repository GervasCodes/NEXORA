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

exports.findByBuyer = async (buyerId) => {
    const [rows] = await db.query(
        `SELECT d.id, d.dispute_number, d.order_id, d.type, d.status, d.subject,
                d.resolution, d.refund_amount, d.created_at, d.updated_at,
                o.order_number
        FROM disputes d
        JOIN orders o ON o.id = d.order_id
        WHERE d.buyer_id = ?
        ORDER BY d.created_at DESC`,
        [buyerId]
    );
    return rows;
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

exports.resolve = async (id, { status, resolution, resolutionNote, refundAmount, resolvedBy }) => {
    await db.query(
        `UPDATE disputes
        SET status = ?, resolution = ?, resolution_note = ?, refund_amount = ?,
            resolved_by = ?, resolved_at = NOW()
        WHERE id = ?`,
        [status, resolution, resolutionNote || null, refundAmount || null, resolvedBy, id]
    );
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
                u.first_name, u.last_name
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
