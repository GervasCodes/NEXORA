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

    // Phase 3.2: restyled from a small bottom-left utility card into a
    // deliberate, full-width bottom sheet that matches the splash
    // screen's brand treatment (SplashScreen.jsx) - same abyss/frost
    // surface and violet-to-azure glow accents, rather than the generic
    // glass-strong card used elsewhere in the app. Now only mounted on
    // the guest landing route (see App.jsx), it sits flush at the very
    // bottom of the screen, well below InstallPrompt.jsx's own
    // calc(10rem+...) offset, so the two no longer need to be
    // horizontally separated (bottom-left vs. bottom-right) to avoid
    // colliding - copy/logic (localStorage dismissal, cookie policy
    // link) is unchanged.
    return (
        <div
            role="region"
            aria-label="Cookie notice"
            className="fixed inset-x-0 bottom-0 z-[1040] animate-slide-up"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
            <div className="relative overflow-hidden border-t border-frost/20 bg-abyss/95 backdrop-blur-xl">
                <div
                    className="pointer-events-none absolute -top-16 -left-16 w-64 h-64 rounded-full opacity-30 blur-[90px]"
                    style={{ background: "radial-gradient(circle, #7C3AED 0%, transparent 70%)" }}
                />
                <div
                    className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-30 blur-[90px]"
                    style={{ background: "radial-gradient(circle, #1D4ED8 0%, transparent 70%)" }}
                />
                <div className="relative max-w-3xl mx-auto px-6 py-6 sm:py-7 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                        <p className="font-display italic text-frost text-base mb-1">A quick note on cookies</p>
                        <p className="text-sm text-frost/70 leading-relaxed">
                            NEXORA uses only the cookies needed to sign you in and keep your account
                            secure. No advertising or third-party tracking.{" "}
                            <Link to="/legal/cookie-policy" className="text-teal hover:underline">
                                Cookie Policy
                            </Link>
                        </p>
                    </div>
                    <button
                        onClick={accept}
                        className="shrink-0 self-start sm:self-auto bg-frost text-abyss rounded-lg px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity focus-ring"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
}
