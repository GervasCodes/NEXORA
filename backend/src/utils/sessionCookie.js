// Phase 4 (Testing & Session Hardening) - centralizes the httpOnly
// session cookie's options so login (auth.controller.js) and logout use
// identical settings. res.clearCookie only actually clears a cookie if
// its options (path, domain, sameSite, secure) match how it was set -
// mismatched options here would silently fail to log someone out.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// `secure` must be true in production (cookie only sent over HTTPS) but
// false in local dev (plain http://localhost), or the browser drops the
// cookie entirely and login silently "doesn't work" in dev.
const isProd = () => process.env.NODE_ENV === "production";

const sessionCookieOptions = () => ({
    httpOnly: true,
    secure: isProd(),
    sameSite: "strict",
    maxAge: SEVEN_DAYS_MS,
    path: "/"
});

// Deliberately NOT httpOnly - the frontend needs to read this value with
// plain JS to echo it back as the X-CSRF-Token header. See
// csrf.middleware.js for why that's still safe.
const csrfCookieOptions = () => ({
    httpOnly: false,
    secure: isProd(),
    sameSite: "strict",
    maxAge: SEVEN_DAYS_MS,
    path: "/"
});

module.exports = { sessionCookieOptions, csrfCookieOptions, SEVEN_DAYS_MS };
