const db = require("../../config/db");

exports.invalidateActive = async (userId, purpose, executor = db) => {
    await executor.query(
        `UPDATE otp_codes SET consumed_at = NOW()
        WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL`,
        [userId, purpose]
    );
};

exports.create = async (userId, purpose, codeHash, expiresAt, executor = db) => {
    const [result] = await executor.query(
        `INSERT INTO otp_codes (user_id, purpose, code_hash, expires_at)
        VALUES (?, ?, ?, ?)`,
        [userId, purpose, codeHash, expiresAt]
    );
    return result.insertId;
};

exports.findActive = async (userId, purpose) => {
    const [rows] = await db.query(
        `SELECT * FROM otp_codes
        WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
        [userId, purpose]
    );
    return rows[0];
};

exports.incrementAttempts = async (id) => {
    await db.query("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?", [id]);
};

exports.consume = async (id) => {
    await db.query("UPDATE otp_codes SET consumed_at = NOW() WHERE id = ?", [id]);
};

// How many OTPs have been requested for this purpose in the last N minutes -
// simple throttle so someone can't hammer /resend-otp into a Brevo bill.
exports.countRecent = async (userId, purpose, minutes) => {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS count FROM otp_codes
        WHERE user_id = ? AND purpose = ? AND created_at > (NOW() - INTERVAL ? MINUTE)`,
        [userId, purpose, minutes]
    );
    return rows[0].count;
};
