import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { isAnalyticsConfigured, setAnalyticsConsent } from "../utils/analytics";

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
// Analytics is now supported, but strictly opt-in: when
// VITE_GA_MEASUREMENT_ID is set, this banner shows Accept / Decline and
// utils/analytics.js loads nothing until "Accept" is pressed. With no
// measurement id configured it stays the plain one-button notice below.
//
// Dismissal is stored per browser profile in localStorage, the same
// shape InstallPrompt.jsx already uses for its own dismissal flag, so
// this never becomes a banner that reappears on every visit.
export const COOKIE_NOTICE_KEY = "nexora_cookie_notice_acknowledged";

// Fallback so the notice still appears for a visitor who only reads.
const READY_FALLBACK_MS = 12000;

export default function CookieConsentBanner({ onAcknowledged }) {
    const { t } = useLanguage();
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

    const analyticsAsked = isAnalyticsConfigured();

    const accept = (analytics = false) => {
        if (analyticsAsked) setAnalyticsConsent(analytics ? "granted" : "denied");
        setAcknowledged(true);
        onAcknowledged?.();
        try {
            localStorage.setItem(COOKIE_NOTICE_KEY, "1");
        } catch {
            // Best-effort - the banner is already hidden for this
            // session via state above.
        }
    };

    // Phase 1: the notice is a slim one-line bar, and it waits for the
    // visitor's first interaction (or READY_FALLBACK_MS) so the first
    // seconds of a visit are the page, not a legal sheet.
    const [ready, setReady] = useState(false);
    useEffect(() => {
        if (acknowledged) return undefined;
        const show = () => setReady(true);
        const events = ["scroll", "pointerdown", "keydown", "touchstart"];
        events.forEach((e) => window.addEventListener(e, show, { once: true, passive: true }));
        const timer = setTimeout(show, READY_FALLBACK_MS);
        return () => {
            events.forEach((e) => window.removeEventListener(e, show));
            clearTimeout(timer);
        };
    }, [acknowledged]);

    if (acknowledged || !ready) return null;

    return (
        <div
            role="region"
            aria-label={t("cookie.region")}
            className="fixed inset-x-0 bottom-0 z-[var(--z-banner)] animate-slide-up motion-reduce:animate-none"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
            <div className="border-t border-frost/20 bg-abyss/95 backdrop-blur-xl">
                <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-3">
                    <p className="flex-1 min-w-0 text-xs sm:text-sm text-frost/85 leading-snug">
                        {analyticsAsked ? t("cookie.textAnalytics") : t("cookie.text")}{" "}
                        <Link to="/terms#cookie-policy" className="text-frost underline underline-offset-2 hover:text-azure-light">
                            {t("cookie.policy")}
                        </Link>
                    </p>
                    {analyticsAsked && (
                        <button
                            onClick={() => accept(false)}
                            className="shrink-0 border border-frost/40 text-frost rounded-lg px-4 min-h-[44px] text-sm font-medium hover:bg-frost/10 transition-colors focus-ring"
                        >
                            {t("cookie.decline")}
                        </button>
                    )}
                    <button
                        onClick={() => accept(true)}
                        className="shrink-0 bg-frost text-abyss rounded-lg px-4 min-h-[44px] text-sm font-medium hover:opacity-90 transition-opacity focus-ring"
                    >
                        {analyticsAsked ? t("cookie.acceptAnalytics") : t("cookie.accept")}
                    </button>
                </div>
            </div>
        </div>
    );
}
