const rateLimit = require("express-rate-limit");

// Auth endpoints (login, register, OTP verify/resend) are the highest-value
// target for brute force and the most expensive to abuse: each hit can
// trigger a bcrypt compare, a DB write, and - for OTP - a Brevo email send.
// 20 requests per 15 minutes per IP is generous for a real user (a login
// plus a couple of OTP retries) but shuts down scripted abuse fast.
exports.authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many attempts. Please wait a few minutes and try again." }
});

// A looser, general safety net across the whole API - mainly guards
// against a misbehaving client or scraper hammering the server, not
// normal browsing/shopping traffic.
exports.apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please slow down." }
});
