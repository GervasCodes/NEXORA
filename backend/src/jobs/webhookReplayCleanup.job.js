// webhook_replay_guard (migration 072) accumulates one row per accepted
// webhook delivery forever with nothing else cleaning it up. The replay
// window it protects against (see utils/webhookReplayGuard.js) is only a
// few minutes, so rows far older than that add nothing but table size -
// same reasoning as otpCleanup.job.js for otp_codes.

const db = require("../config/db");
const logger = require("../utils/logger").child({ module: "job:webhookReplayCleanup" });

const RETENTION_DAYS = 2;

exports.run = async () => {
    const [result] = await db.query(
        `DELETE FROM webhook_replay_guard
        WHERE received_at < (NOW() - INTERVAL ? DAY)`,
        [RETENTION_DAYS]
    );

    if (result.affectedRows) {
        logger.info({ removed: result.affectedRows }, "removed old webhook replay-guard record(s)");
    }
};
