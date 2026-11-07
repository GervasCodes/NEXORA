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

// Trimmed req/res serializers (Phase 2 follow-up: investigating baseline
// listing-endpoint latency). pino-http's default serializers
// (pino.stdSerializers.req/res) dump EVERY response header on every
// single request/response - including the full computed
// Content-Security-Policy string (which is a few hundred bytes on its
// own, see app.js's helmet config) and, for authenticated requests, the
// cookie header (present but redacted below, not omitted - still
// serialized and written out as the literal string "[redacted]" per
// line). At any real request rate this multiplies into a lot of bytes
// written to stdout per second, and that write is where the cost shows
// up: Node's console/stdout write blocks the event loop once the OS-level
// pipe buffer fills faster than whatever's on the other end (a
// terminal, `nodemon`, a log aggregator) can drain it - worse on some
// terminals than others, but never free. None of the redacted/omitted
// fields below carry diagnostic value age-to-day: method, url, status
// code and response time (which pino-http adds automatically) already
// answer "what happened and how long did it take"; the full header set
// is occasionally useful when actively debugging one specific request,
// but not useful serialized unconditionally on all of them, day to day.
const trimmedReqSerializer = (req) => ({
    id: req.id,
    method: req.method,
    url: req.url
});
const trimmedResSerializer = (res) => ({
    statusCode: res.statusCode
});

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
    serializers: {
        req: trimmedReqSerializer,
        res: trimmedResSerializer
    },
    // Kept (harmless now that req/res no longer serialize headers at
    // all) rather than removed outright, in case a future caller adds a
    // custom serializer back that does include headers - this stays as
    // the safety net for that case rather than relying on every future
    // edit here to remember it.
    redact: {
        paths: ["req.headers.authorization", "req.headers.cookie"],
        censor: "[redacted]"
    }
});
