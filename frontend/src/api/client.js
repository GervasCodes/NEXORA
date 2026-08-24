import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1",
    // Phase 4 (Testing & Session Hardening): the session now travels as
    // an httpOnly cookie rather than a Bearer header built from a
    // localStorage token - withCredentials is what makes axios actually
    // send (and accept Set-Cookie for) cross-origin requests at all.
    // Paired with the backend's explicit CORS origin + credentials:true
    // (a wildcard "*" origin can't be combined with credentialed
    // requests per the CORS spec).
    withCredentials: true
});

// Phase 4: reads the CSRF token out of the (deliberately non-httpOnly)
// nexora_csrf cookie the backend sets alongside the session cookie at
// login - see backend/src/middleware/csrf.middleware.js for the
// double-submit pattern this is half of. document.cookie is a flat
// "a=1; b=2" string; there's no built-in parser for it.
//
// This only actually works when frontend and backend share an origin
// (local dev, both on localhost). In production they're cross-origin
// (frontend on nexoramarketplace.online, API on an onrender.com
// subdomain - see backend/src/utils/sessionCookie.js) - a cookie set by
// a cross-origin response is stored under THAT origin, not ours, so
// document.cookie here can never see it no matter how fresh/valid it is
// server-side. Every mutating admin/seller/buyer action was hitting
// CSRF_TOKEN_INVALID (403) in production because of exactly this: the
// header was silently never attached. See csrfToken below for the actual
// fix - kept this cookie read only as a same-origin/local-dev fallback.
const readCookie = (name) => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
};

const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);

// The real, production-safe source for the CSRF header. AuthContext.jsx
// populates this from the response BODY of a successful login or
// /auth/me call (see auth.controller.js) - a channel that's
// same-origin-protected (a cross-site attacker can't read our response
// bodies either) but, unlike a cookie set by a cross-origin response,
// actually reaches this page's own JS.
let csrfToken = null;
export const setCsrfToken = (token) => {
    csrfToken = token || null;
};

// AuthContext registers a handler here on mount. api/client.js lives
// outside the React tree, so this is the hook that lets a suspension
// discovered mid-session (a still-valid token whose account an admin
// just suspended - see auth.middleware.js) reach AuthContext and show
// the full-screen suspended page, regardless of what route the person
// was on when it happened.
let suspensionHandler = null;
export const registerSuspensionHandler = (handler) => {
    suspensionHandler = handler;
};

// AuthContext registers a handler here too (Phase 2: Session expiry).
// Fired only when a 401 arrives for a request that WAS carrying a real
// token - i.e. an existing session just died server-side (natural JWT
// expiry, password change invalidating token_version, etc) - never for
// an anonymous call made while already logged out, which would be a
// confusing "session expired" toast for someone who was never signed in.
let sessionExpiredHandler = null;
export const registerSessionExpiredHandler = (handler) => {
    sessionExpiredHandler = handler;
};

// Fired when the server rejects a mutating request with CSRF_TOKEN_INVALID
// (403). This happens when the nexora_csrf cookie has expired or been
// cleared (e.g. browser ITP, Safari aggressive cookie pruning, or a long
// idle session) while nexora_session is still valid. The only reliable
// recovery is a page refresh which re-reads a fresh CSRF cookie from the
// server - the handler in AuthContext shows a non-dismissible reload prompt.
let csrfExpiredHandler = null;
export const registerCsrfExpiredHandler = (handler) => {
    csrfExpiredHandler = handler;
};

api.interceptors.request.use((config) => {
    // Phase 4 (Testing & Session Hardening): no more reading a token out
    // of localStorage to build an Authorization header - the httpOnly
    // session cookie is attached automatically by the browser via
    // withCredentials above. What DOES still need explicit JS is the
    // CSRF token, since the whole point of the double-submit pattern is
    // that only a page that can actually read the cookie (i.e. our own
    // frontend, not a cross-site attacker) can also set this header -
    // see csrf.middleware.js. Only needed on requests that change state;
    // attaching it to GETs would be harmless but pointless.
    if (MUTATING_METHODS.has(config.method)) {
        const token = csrfToken || readCookie("nexora_csrf");
        if (token) {
            config.headers["X-CSRF-Token"] = token;
        }
    }

    // Last-activity marker AuthContext's idle-expiry check reads on load
    // (see AuthContext.jsx) - refreshed on every request while a session
    // cookie appears to exist, so a person actively using the app never
    // gets logged out mid-session no matter how long that session runs.
    // (This is a best-effort local signal, not authoritative - the
    // cookie itself is the real source of truth and isn't readable here;
    // this just avoids updating the timestamp for someone who's clearly
    // never logged in at all.)
    if (csrfToken || readCookie("nexora_csrf")) {
        localStorage.setItem("nexora_last_activity", Date.now().toString());
    }

    // Kept in sync with LanguageContext's own localStorage key - read
    // directly here (rather than via the hook) so this works even for
    // requests fired before the provider mounts.
    const language = localStorage.getItem("nexora_language");
    if (language) {
        config.headers["Accept-Language"] = language;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.data?.code === "ACCOUNT_SUSPENDED") {
            localStorage.removeItem("nexora_user");
            localStorage.removeItem("nexora_last_activity");
            suspensionHandler?.(error.response.data?.data?.reason || null);
            return Promise.reject(error);
        }

        // CSRF token missing or expired (nexora_csrf cookie gone while the
        // session cookie survived). The interceptor fires this once so the
        // UI can show a non-dismissible "please refresh" prompt - no silent
        // retry because the CSRF cookie itself must be re-issued server-side
        // (at login) and can only be refreshed by reloading the page.
        if (
            error.response?.status === 403 &&
            error.response?.data?.code === "CSRF_TOKEN_INVALID"
        ) {
            csrfExpiredHandler?.();
            return Promise.reject(error);
        }

        if (error.response?.status === 401) {
            // No token to check in localStorage anymore (see above) - a
            // cached user object is the best local signal that this
            // was a real, previously-authenticated session dying,
            // rather than an anonymous call made while already logged
            // out (which would show a confusing "session expired" toast
            // to someone who was never signed in).
            const hadUser = Boolean(localStorage.getItem("nexora_user"));
            localStorage.removeItem("nexora_user");
            localStorage.removeItem("nexora_last_activity");
            if (hadUser) {
                sessionExpiredHandler?.();
            }
        }
        return Promise.reject(error);
    }
);

// Small helper so callers get a clean message string regardless of
// whether the backend sent { message } or { errors: [...] }
export const extractErrorMessage = (error) => {
    const data = error?.response?.data;
    if (data?.message) return data.message;
    if (data?.errors?.length) return data.errors[0].msg || data.errors[0].message;
    return "Something went wrong. Please try again";
};

export default api;
