const db = require("../../config/db");
const logger = require("../../utils/logger");

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

// Best-effort, fire-and-forget - unlike recordUsage above, a lost
// outcome row must never delay or fail the actual AI/fallback response
// it's describing, since ai_call_outcomes (migration 108) only feeds
// the Admin Settings quality panel, never the spend guard itself.
// Mirrors audit.service.js#log's "log and move on" pattern.
exports.recordOutcome = ({ feature, outcome }) => {
    db.query(
        `INSERT INTO ai_call_outcomes (feature, outcome) VALUES (?, ?)`,
        [feature, outcome]
    ).catch((error) => {
        logger.warn({ err: error, feature, outcome }, "[ai] failed to record call outcome - non-fatal");
    });
};

// Per-feature success/fallback counts since `since` - backs the Admin
// Settings AI quality panel. Grouped in SQL rather than pulled
// row-by-row, same reasoning as getGlobalTokensSince above.
exports.getOutcomeCountsSince = async (since) => {
    const [rows] = await db.query(
        `SELECT feature, outcome, COUNT(*) AS count
         FROM ai_call_outcomes WHERE created_at >= ?
         GROUP BY feature, outcome`,
        [since]
    );
    return rows.map((row) => ({ feature: row.feature, outcome: row.outcome, count: Number(row.count) }));
};
