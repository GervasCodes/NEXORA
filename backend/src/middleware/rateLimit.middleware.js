const rateLimit = require("express-rate-limit");

// Load-testing bypass for apiLimiter only (never authLimiter - brute-force
// protection on login/OTP stays on regardless). A load test (see
// backend/loadtest/) legitimately needs to send way more than 600
// requests/15min from one IP, which is indistinguishable from the abuse
// this limiter exists to stop unless the request proves it's a deliberate
// test. Three independent conditions must ALL hold before this skips a
// request, so it can't fire by accident or in production:
//   1. NODE_ENV is not "production" (checked here, not just left to
//      whoever sets the env var below - a non-production check baked into
//      the code itself, not only into deployment config).
//   2. LOADTEST_BYPASS_TOKEN is set on the server's own environment - off
//      by default, something an operator opts into per-environment.
//   3. The request itself carries that exact value in an
//      X-Loadtest-Bypass-Token header - so even with the env var set,
//      ordinary traffic (which never sends this header) is unaffected and
//      still rate-limited normally.
const loadtestBypass = (req) =>
    process.env.NODE_ENV !== "production" &&
    !!process.env.LOADTEST_BYPASS_TOKEN &&
    req.get("X-Loadtest-Bypass-Token") === process.env.LOADTEST_BYPASS_TOKEN;

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
    skip: loadtestBypass,
    message: { success: false, message: "Too many requests. Please slow down." }
});

// Username availability checks (registration + account settings) are public
// and cheap, but they let a script probe which names exist, so they get a
// tighter per-IP limit than the general API: 30 checks per minute is plenty
// for someone typing a name (the client also debounces).
exports.usernameCheckLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: loadtestBypass,
    message: { success: false, message: "Too many username checks. Please wait a minute and try again." }
});
