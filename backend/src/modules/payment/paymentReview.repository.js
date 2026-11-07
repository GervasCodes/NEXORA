const db = require("../../config/db");

// One row per (payment, reason). Raising the same flag again (a replayed
// webhook, tomorrow's reconciliation run) refreshes the details of the
// existing row and reports isNew = false, so admins are alerted once.
exports.upsert = async ({ paymentId, reason, details }) => {
    const [result] = await db.query(
        `INSERT INTO payment_review_queue (payment_id, reason, details)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE details = VALUES(details)`,
        [paymentId, reason, details ? JSON.stringify(details) : null]
    );
    // mysql2: 1 = inserted, 2 = existing row updated, 0 = existing row unchanged
    return { id: result.insertId || null, isNew: result.affectedRows === 1 };
};

exports.list = async ({ status = "open", limit = 100, offset = 0 } = {}) => {
    const [rows] = await db.query(
        `SELECT q.*, p.purpose, p.method, p.amount, p.status AS payment_status,
            p.payment_reference, p.transaction_reference,
            p.order_id, p.booking_id, p.subscription_id, p.topup_id, p.seller_id
        FROM payment_review_queue q
        JOIN payments p ON p.id = q.payment_id
        WHERE q.status = ?
        ORDER BY q.created_at ASC
        LIMIT ? OFFSET ?`,
        [status, Number(limit), Number(offset)]
    );
    return rows;
};

exports.countOpen = async () => {
    const [[row]] = await db.query("SELECT COUNT(*) AS total FROM payment_review_queue WHERE status = 'open'");
    return Number(row.total);
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM payment_review_queue WHERE id = ?", [id]);
    return rows[0];
};

exports.resolve = async (id, adminId, note) => {
    const [result] = await db.query(
        `UPDATE payment_review_queue
        SET status = 'resolved', resolved_by = ?, resolved_at = NOW(), resolution_note = ?
        WHERE id = ? AND status = 'open'`,
        [adminId, note ? String(note).slice(0, 500) : null, id]
    );
    return result.affectedRows === 1;
};

exports.hasOpenForPayment = async (paymentId) => {
    const [rows] = await db.query(
        "SELECT id FROM payment_review_queue WHERE payment_id = ? AND status = 'open' LIMIT 1",
        [paymentId]
    );
    return rows.length > 0;
};
