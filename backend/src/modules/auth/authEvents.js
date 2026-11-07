const crypto = require("crypto");
const logger = require("../../utils/logger").child({ module: "auth" });

// Structured attempt logging for login / OTP verify / OTP resend, built on
// the app's existing pino logger (utils/logger.js) - no new logging setup.
// Every attempt emits one JSON line with the same `event: "auth_attempt"`
// shape, so a log aggregator (or grep on Render's log viewer) can answer
// the questions this exists for: how many failures per hour, is one IP or
// user agent behind most of them, are many different accounts being tried
// from one address (credential stuffing) or one account from many
// addresses (the case the per-account lockout targets), and how often the
// lockout actually fires.
//
//   { event: "auth_attempt", endpoint: "login" | "login_otp_verify" |
//     "login_otp_resend", outcome: "success" | "failure", reason,
//     userId?, emailHash?, ip, userAgent }
//
// Emails are logged only as a short SHA-256 prefix: enough to group
// attempts against the same address without putting the address itself in
// the logs. (The audit log already keeps full detail for login events.)
//
// Lockout triggers are logged separately by loginLockout.service.js as
// `event: "auth_account_locked"`.

const hashEmail = (email) => {
    if (!email) return undefined;
    return crypto.createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex").slice(0, 12);
};

// Why an attempt failed, from an error thrown by the login/OTP services.
// Prefers the services' monitoring-only `failureReason`, then the i18n
// error code, and never the message text.
exports.reasonFor = (error) => (error && (error.failureReason || error.code)) || "error";

exports.logAuthAttempt = (req, { endpoint, outcome, reason, userId, email }) => {
    try {
        const payload = {
            event: "auth_attempt",
            endpoint,
            outcome,
            reason,
            userId: userId ?? undefined,
            emailHash: hashEmail(email),
            ip: req.ip,
            userAgent: String(req.get?.("user-agent") || "").slice(0, 120) || undefined
        };

        if (outcome === "success") {
            logger.info(payload, `auth ${endpoint} succeeded`);
        } else {
            logger.warn(payload, `auth ${endpoint} failed`);
        }
    } catch (error) {
        // Logging must never be the reason a sign-in fails.
    }
};
