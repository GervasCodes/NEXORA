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

// `sameSite`: the frontend (nexoramarketplace.online) and this API
// (an onrender.com subdomain) are different registrable domains, so
// every request the frontend makes to this API - not just top-level
// navigation, but the fetch/XHR calls AuthContext.jsx, the notification
// bells, and the socket.io handshake all make - is a cross-site request
// from the browser's point of view. `SameSite=Strict` (and `Lax`, for
// non-GET/non-top-level-navigation requests) never attaches the cookie
// to those: the browser silently omits it rather than erroring, so
// every one of those calls looks to the server exactly like a logged-out
// request and gets a 401. That's what produced the "logs back out
// immediately with session expired" symptom right after a successful
// login/OTP-verify - the very next authenticated call (a notification
// poll or the socket handshake) carried no cookie at all. `SameSite=None`
// is required for a cross-site cookie to be sent on those requests; it's
// only valid when paired with `Secure` (enforced below - same isProd()
// gate this already had), which is fine since production is HTTPS-only
// anyway. Local dev keeps `Lax`: frontend and backend both run on
// http://localhost there, which is same-site (differing only by port),
// so `Lax` already works and doesn't require HTTPS the way `None` does.
const sameSitePolicy = () => (isProd() ? "none" : "lax");

const sessionCookieOptions = () => ({
    httpOnly: true,
    secure: isProd(),
    sameSite: sameSitePolicy(),
    maxAge: SEVEN_DAYS_MS,
    path: "/"
});

// Deliberately NOT httpOnly - the frontend needs to read this value with
// plain JS to echo it back as the X-CSRF-Token header. See
// csrf.middleware.js for why that's still safe.
const csrfCookieOptions = () => ({
    httpOnly: false,
    secure: isProd(),
    sameSite: sameSitePolicy(),
    maxAge: SEVEN_DAYS_MS,
    path: "/"
});

module.exports = { sessionCookieOptions, csrfCookieOptions, SEVEN_DAYS_MS };
