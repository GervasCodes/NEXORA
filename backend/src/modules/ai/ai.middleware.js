const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// Per-user (or per-IP for anonymous callers) rate limiting for every
// Nexora AI endpoint - global constraint: "Per-user rate limiting and a
// backend spending guard ... required before any phase goes live". This
// is the request-rate half; ai.service.js#checkSpendGuard is the token-
// spend half. 30/15min is generous for a real chat/search session but
// stops a scripted loop from burning through the token caps fast.
exports.aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    // Signed-in requests are keyed by user id (so one buyer can't dodge
    // the limit by rotating networks); anonymous requests fall back to
    // IP, same as apiLimiter.
    keyGenerator: (req, res) => req.user?.id?.toString() || ipKeyGenerator(req, res),
    message: { success: false, message: "Nexora AI is getting a lot of requests right now - please wait a moment and try again." }
});
