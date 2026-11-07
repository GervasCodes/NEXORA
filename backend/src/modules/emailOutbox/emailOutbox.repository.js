const db = require("../../config/db");

exports.insert = async ({ to, subject, text, html }) => {
    await db.query(
        `INSERT INTO email_outbox (to_email, subject, text_body, html_body)
        VALUES (?, ?, ?, ?)`,
        [to, subject, text, html || null]
    );
};

exports.findDue = async (limit) => {
    const [rows] = await db.query(
        `SELECT id, to_email, subject, text_body, html_body, attempts
        FROM email_outbox
        WHERE status = 'pending' AND next_attempt_at <= NOW()
        ORDER BY next_attempt_at, id
        LIMIT ?`,
        [limit]
    );
    return rows;
};

exports.markSent = async (id, attempts) => {
    await db.query(
        `UPDATE email_outbox
        SET status = 'sent', attempts = ?, last_error = NULL, sent_at = NOW()
        WHERE id = ? AND status = 'pending'`,
        [attempts, id]
    );
};

exports.markRetry = async (id, attempts, lastError, delayMinutes) => {
    await db.query(
        `UPDATE email_outbox
        SET attempts = ?, last_error = ?, next_attempt_at = NOW() + INTERVAL ? MINUTE
        WHERE id = ? AND status = 'pending'`,
        [attempts, lastError, delayMinutes, id]
    );
};

exports.markFailed = async (id, attempts, lastError) => {
    await db.query(
        `UPDATE email_outbox
        SET status = 'failed', attempts = ?, last_error = ?
        WHERE id = ? AND status = 'pending'`,
        [attempts, lastError, id]
    );
};

exports.countFailed = async () => {
    const [[row]] = await db.query(
        `SELECT COUNT(*) AS count FROM email_outbox WHERE status = 'failed'`
    );
    return Number(row.count) || 0;
};
