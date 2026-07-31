// Structured (JSON-per-line) logging for the backend, replacing scattered
// console.log/console.error calls. JSON output means logs are parseable
// by whatever's actually reading them in production (Render's log
// viewer, or a log aggregator piped from it) instead of relying on
// grepping free-text strings.
//
// Usage: const logger = require("../../utils/logger"); logger.info({...}, "message")
// or logger.child({ module: "payment" }) for a logger that tags every
// line with that context automatically - see payment.controller.js /
// payment.service.js for the webhook-handling usage.
const pino = require("pino");

const logger = pino({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
    base: { service: "nexora-backend" },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Never let a logged object leak credentials/tokens into log
    // output/Render's logs/any downstream log aggregator, even if a
    // caller accidentally logs a full request/user object.
    redact: {
        paths: [
            "password",
            "*.password",
            "token",
            "*.token",
            "authorization",
            "*.authorization",
            "req.headers.authorization",
            "req.headers.cookie"
        ],
        censor: "[redacted]"
    }
});

module.exports = logger;
