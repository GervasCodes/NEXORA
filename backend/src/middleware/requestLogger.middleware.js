// Per-request structured access logging (method, path, status, response
// time, a generated request id) - the HTTP-layer counterpart to
// utils/logger.js, which app-level code uses for everything else.
//
// Mounted early in app.js so the generated request id (res.locals /
// req.id, echoed back as an X-Request-Id response header) is available
// to every downstream handler - useful for correlating "this webhook
// call failed" log lines with the exact request that caused it when
// cross-referencing against a provider's own delivery logs.
const pinoHttp = require("pino-http");
const logger = require("../utils/logger");

module.exports = pinoHttp({
    logger,
    genReqId: (req, res) => {
        const existing = req.headers["x-request-id"];
        const id = existing || require("crypto").randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
    },
    customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
    },
    // /health is polled every few minutes by uptime monitors (see
    // docs/UPTIME_MONITORING.md) - logging every poll would drown out
    // everything else in the log stream for no diagnostic value.
    autoLogging: {
        ignore: (req) => req.url === "/health"
    },
    redact: {
        paths: ["req.headers.authorization", "req.headers.cookie"],
        censor: "[redacted]"
    }
});
