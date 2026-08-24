const crypto = require("crypto");

// Phase 4 (Testing & Session Hardening) - CSRF protection for the new
// httpOnly session cookie.
//
// Background: a Bearer token attached via JS (the old localStorage
// scheme) is naturally CSRF-immune - a malicious site can't read
// localStorage or silently attach a custom Authorization header to a
// cross-origin form/image/fetch. A cookie is different: the browser
// attaches it automatically to same-origin requests regardless of what
// page triggered them, which is exactly what CSRF exploits. Moving the
// session to an httpOnly cookie (for XSS resistance) reintroduces that
// risk, so this middleware closes it back up.
//
// Double-submit cookie pattern: at login, the server sets a second,
// deliberately non-httpOnly cookie (`nexora_csrf`) alongside the session
// cookie, AND returns that same value in the login response body (see
// auth.controller.js#verifyLoginOtp - that second part exists because in
// a cross-origin deployment, the frontend's own JS can't actually read a
// cookie this response set, only the backend can - document.cookie is
// scoped to the page's own origin, not the responding server's). The
// frontend echoes that value back as an `X-CSRF-Token` header on every
// mutating request, while the browser separately auto-attaches the
// cookie itself to the request (cross-site cookie attachment on outgoing
// requests works fine with SameSite=None, unlike cross-origin JS reads).
// A cross-site attacker can trigger a request that carries the cookie
// automatically, but was never in a position to have received that
// login response body in the first place (same-origin policy) - so a
// mismatch (or missing header) means the request didn't originate from
// our own frontend.
//
// Only applies to cookie-authenticated requests. A request carrying its
// own `Authorization: Bearer` header (API clients, the existing backend
// test suite) is already immune to CSRF by construction and is exempt -
// enforcing this against Bearer requests would just break non-browser
// API consumers for no security benefit.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

module.exports = function csrfProtection(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    // Bearer-authenticated request - not cookie-driven, CSRF doesn't apply.
    if (req.headers.authorization?.startsWith("Bearer ")) return next();

    // No session cookie at all - nothing to protect (auth.middleware will
    // separately reject the request as unauthenticated if it needed one).
    if (!req.cookies?.nexora_session) return next();

    const cookieToken = req.cookies?.nexora_csrf;
    const headerToken = req.headers["x-csrf-token"];

    if (
        !cookieToken ||
        !headerToken ||
        cookieToken.length !== headerToken.length ||
        !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
    ) {
        return res.status(403).json({
            success: false,
            code: "CSRF_TOKEN_INVALID",
            message: "Your session couldn't be verified. Please refresh the page and try again."
        });
    }

    next();
};

// Generates a fresh CSRF token for a new session - called alongside
// generateToken() wherever a session cookie is issued (currently just
// login.service.js's verifyLoginOtp, via auth.controller.js).
module.exports.generateCsrfToken = () => crypto.randomBytes(32).toString("hex");
