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

// Phase 6 (Session/login flag) - investigated whether this SameSite=None
// requirement could be avoided instead of just documented, since it's
// the root cause of the Safari/iOS "session expired right after login"
// reports (Safari's Intelligent Tracking Prevention is markedly more
// aggressive than Chrome/Firefox about partitioning or dropping
// cross-site cookies, even ones correctly marked SameSite=None; Secure).
// The real fix is routing the frontend's API calls through a same-site
// path - e.g. nexoramarketplace.online/api/* rewritten to the backend -
// so the browser sees this cookie as first-party instead of cross-site
// and SameSite=Lax/Strict would work everywhere, Safari included.
//
// Checked this codebase/repo specifically for an existing rewrite/
// reverse-proxy mechanism to wire that through:
//   - frontend/vite.config.js has no `server.proxy` (and wouldn't apply
//     to a production static build anyway, only Vite's own dev server)
//   - frontend/public/_redirects is Netlify-style but only handles SPA
//     fallback routing (`/* -> /index.html`), nothing for `/api/*`
//   - no vercel.json / netlify.toml / render.yaml / nginx.conf exists
//     anywhere in the repo
//   - docs/DEPLOYMENT.md explicitly punts this to whatever's hosting the
//     built frontend ("Serve frontend/dist behind your usual static
//     host / reverse proxy (Nginx, Vercel, Netlify, etc.)") - i.e. the
//     actual hosting/proxy configuration lives in that host's dashboard
//     or DNS settings, outside this repo and outside what a code change
//     here can reach.
// So this genuinely isn't fixable from within this codebase alone - it
// needs an infra/DNS-level same-site proxy set up wherever the frontend
// is actually hosted. Per the phase's own instruction: not attempting a
// partial workaround that weakens cookie security here (e.g. dropping
// Secure or httpOnly) just to sidestep SameSite=None - that would trade
// a Safari-specific inconvenience for a real cross-site vulnerability on
// every other browser. Leaving this as SameSite=None; Secure (correct
// and necessary given the current cross-origin hosting setup) until a
// same-site reverse proxy is provisioned outside this repo.

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
