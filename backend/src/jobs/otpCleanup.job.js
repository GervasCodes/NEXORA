// otp_codes accumulates one row per login/password-change/reset attempt
// forever with nothing else cleaning it up. None of these rows are
// useful once they're consumed or long expired, so this just keeps the
// table small - it's not a correctness fix, otp.service.js already
// ignores expired/consumed codes regardless of whether this job runs.

const db = require("../config/db");

const RETENTION_DAYS = 7;

exports.run = async () => {
    const [result] = await db.query(
        `DELETE FROM otp_codes
        WHERE (consumed_at IS NOT NULL OR expires_at < NOW())
        AND created_at < (NOW() - INTERVAL ? DAY)`,
        [RETENTION_DAYS]
    );

    if (result.affectedRows) {
        console.log(`[otpCleanup job] removed ${result.affectedRows} old OTP code(s)`);
    }
};
