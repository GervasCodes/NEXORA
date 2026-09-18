import { useState } from "react";
import { Link } from "react-router-dom";

// Phase 2 (Legal & Consumer Trust).
//
// Deliberately a *notice*, not a granular opt-in consent manager.
//
// NEXORA currently sets exactly two cookies - `nexora_session` (httpOnly
// session) and `nexora_csrf` (double-submit CSRF token) - both of which
// are strictly necessary: see backend/src/utils/sessionCookie.js and
// csrf.middleware.js. There are no analytics, advertising, or other
// third-party tracking cookies anywhere in the app (frontend/index.html
// loads no third-party script tags), so there is nothing a user could
// meaningfully opt *out* of - a "reject non-essential cookies" button
// would be a control that toggles nothing, which is worse than no
// button at all.
//
// **If analytics or ad tech is ever added, this component must be
// replaced with a real opt-in mechanism that blocks those cookies until
// consent is given** - and cookie-policy.md updated to match. That's
// flagged in PHASE_2_NOTES.md too.
//
// Dismissal is stored per browser profile in localStorage, the same
// shape InstallPrompt.jsx already uses for its own dismissal flag, so
// this never becomes a banner that reappears on every visit.
export const COOKIE_NOTICE_KEY = "nexora_cookie_notice_acknowledged";

export default function CookieConsentBanner() {
    // Read once on mount rather than on every render. Wrapped because
    // localStorage throws in a few real situations (Safari private mode
    // in older versions, storage disabled by policy) and a legal notice
    // must never be the thing that white-screens the app.
    const [acknowledged, setAcknowledged] = useState(() => {
        try {
            return localStorage.getItem(COOKIE_NOTICE_KEY) === "1";
        } catch {
            // Can't persist a dismissal, so don't nag: treat it as
            // already acknowledged rather than showing a banner that can
            // never be permanently dismissed.
            return true;
        }
    });

    const accept = () => {
        setAcknowledged(true);
        try {
            localStorage.setItem(COOKIE_NOTICE_KEY, "1");
        } catch {
            // Best-effort - the banner is already hidden for this
            // session via state above.
        }
    };

    if (acknowledged) return null;

    // Positioned bottom-left so it can't collide with InstallPrompt.jsx
    // (bottom-right on sm+), and using the same
    // calc(...+env(safe-area-inset-bottom)) pattern the other floating
    // elements use, with the md: breakpoint matching where
    // MobileBottomNav actually stops rendering (`md:hidden`).
    return (
        <div
            role="region"
            aria-label="Cookie notice"
            className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] md:bottom-36 inset-x-4 sm:inset-x-auto sm:left-4 z-[1040] sm:w-96
                glass-strong border border-frost/20 rounded-lg px-4 py-3 shadow-lg
                flex flex-col sm:flex-row sm:items-center gap-3 animate-slide-up"
        >
            <p className="text-sm text-ink flex-1 min-w-0">
                NEXORA uses only the cookies needed to sign you in and keep your account
                secure. No advertising or third-party tracking.{" "}
                <Link to="/legal/cookie-policy" className="text-teal hover:underline">
                    Cookie Policy
                </Link>
            </p>
            <button
                onClick={accept}
                className="text-sm font-medium text-teal hover:underline shrink-0 self-end sm:self-auto focus-ring rounded"
            >
                Got it
            </button>
        </div>
    );
}
