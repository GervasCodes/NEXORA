const db = require("../../config/db");

// ---- Referral codes ------------------------------------------------------

exports.findByReferralCode = async (code) => {
    const [rows] = await db.query("SELECT id FROM users WHERE referral_code = ?", [code]);
    return rows[0];
};

exports.setReferralCode = async (userId, code, executor = db) => {
    await executor.query("UPDATE users SET referral_code = ? WHERE id = ?", [code, userId]);
};

exports.setReferredBy = async (userId, referrerId, executor = db) => {
    await executor.query("UPDATE users SET referred_by_user_id = ? WHERE id = ?", [referrerId, userId]);
};

exports.createReferral = async (referrerId, referredUserId, executor = db) => {
    await executor.query(
        "INSERT INTO referrals (referrer_id, referred_user_id) VALUES (?, ?)",
        [referrerId, referredUserId]
    );
};

exports.findReferralByReferredUser = async (referredUserId) => {
    const [rows] = await db.query(
        "SELECT * FROM referrals WHERE referred_user_id = ?",
        [referredUserId]
    );
    return rows[0];
};


exports.findMyReferrals = async (referrerId) => {
    const [rows] = await db.query(
        `SELECT r.id, r.bonus_awarded, r.created_at, u.first_name, u.last_name
        FROM referrals r
        JOIN users u ON u.id = r.referred_user_id
        WHERE r.referrer_id = ?
        ORDER BY r.created_at DESC`,
        [referrerId]
    );
    return rows;
};

// ---- Loyalty points -------------------------------------------------------

exports.getBalance = async (userId) => {
    const [rows] = await db.query("SELECT loyalty_points FROM users WHERE id = ?", [userId]);
    return rows[0] ? rows[0].loyalty_points : 0;
};

exports.addPoints = async (userId, points, type, { orderId, description } = {}, executor = db) => {
    if (points < 0) {
        // Redeeming / debiting (Phase 3, P0) - race-safe: only succeeds if
        // the balance can actually cover it. Previously an unconditional
        // `+= points` here, which two concurrent redemptions for the same
        // user could both pass through and drive loyalty_points negative.
        const [result] = await executor.query(
            "UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ? AND loyalty_points >= ?",
            [points, userId, -points]
        );
        if (result.affectedRows === 0) {
            throw new Error("Your loyalty points balance changed - please try again");
        }
    } else {
        await executor.query(
            "UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?",
            [points, userId]
        );
    }

    const [rows] = await executor.query("SELECT loyalty_points FROM users WHERE id = ?", [userId]);
    const balanceAfter = rows[0].loyalty_points;

    await executor.query(
        `INSERT INTO loyalty_points_ledger (user_id, type, points, balance_after, order_id, description)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, type, points, balanceAfter, orderId || null, description || null]
    );
    return balanceAfter;
};

exports.findLedger = async (userId, limit = 50) => {
    const [rows] = await db.query(
        "SELECT * FROM loyalty_points_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
        [userId, limit]
    );
    return rows;
};
