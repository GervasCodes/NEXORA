const db = require("../../config/db");

// One row per provider call - see migration 081 for why this is a log
// rather than a running counter. Fire-and-forget from the caller's
// perspective is NOT used here (unlike audit.service.js) - a lost usage
// row would let the spend guard undercount real spend, so ai.service.js
// awaits this.
exports.recordUsage = async ({ userId, feature, tokensUsed }) => {
    await db.query(
        `INSERT INTO ai_usage_log (user_id, feature, tokens_used) VALUES (?, ?, ?)`,
        [userId || null, feature, tokensUsed || 0]
    );
};

// Sum of tokens for one user since `since` (inclusive). Used for both
// the daily and monthly per-user caps - the caller picks `since`.
exports.getUserTokensSince = async (userId, since) => {
    const [rows] = await db.query(
        `SELECT COALESCE(SUM(tokens_used), 0) AS total
         FROM ai_usage_log WHERE user_id = ? AND created_at >= ?`,
        [userId, since]
    );
    return Number(rows[0].total);
};

// Same, but across every user (and anonymous/guest rows) - backs the
// platform-wide daily/monthly caps.
exports.getGlobalTokensSince = async (since) => {
    const [rows] = await db.query(
        `SELECT COALESCE(SUM(tokens_used), 0) AS total
         FROM ai_usage_log WHERE created_at >= ?`,
        [since]
    );
    return Number(rows[0].total);
};
