import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

// Resilience & Growth, refined in  Session/UX
// improvements a pending update used to sit as a dismissible banner
// until the person happened to notice it and click Reload - if they
// missed it (or dismissed it), the tab kept running old JS against a
// newer backend API, which is what produced confusing mid-session
// errors that looked like a broken login. Now the update still never
// interrupts someone mid-task, but applies itself automatically as soon
// as it's safe to.
//
// "Safe" = the current route has no likely unsaved state (not a
// checkout, an open chat thread, or a form). On an unsafe route, the
// banner still shows, and: (a) it applies itself the moment the person
// navigates to a safe route, or (b) if it's been sitting ignored for
// longer than IGNORE_TIMEOUT_MS, it applies itself on the very next
// navigation regardless of route - a stale build should never persist
// indefinitely just because someone left a tab open on /messages.
const IGNORE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const UNSAFE_ROUTE_PATTERNS = [
    /^\/checkout$/,
    /^\/cart$/,
    /^\/messages(\/|$)/,
    /^\/account$/,
    /\/new$/,
    /\/edit$/
];

const isUnsafeRoute = (pathname) => UNSAFE_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));

export default function UpdateAvailableBanner() {
    const [visible, setVisible] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const pendingRef = useRef(false);
    const availableSinceRef = useRef(0);
    const location = useLocation();

    useEffect(() => {
        const handleUpdate = () => {
            pendingRef.current = true;
            availableSinceRef.current = Date.now();
            // Apply right away if the tab happens to already be sitting
            // on a safe route when the update arrives - no need to make
            // the person notice a banner just to click through it.
            if (!isUnsafeRoute(window.location.pathname)) {
                window.location.reload();
                return;
            }
            setVisible(true);
        };
        window.addEventListener("nexora:sw-updated", handleUpdate);
        return () => window.removeEventListener("nexora:sw-updated", handleUpdate);
    }, []);

    // Re-checked on every navigation: apply automatically once the
    // person lands somewhere safe, or once the update has been sitting
    // long enough that we apply it regardless of route.
    useEffect(() => {
        if (!pendingRef.current) return;
        const ignoredTooLong = Date.now() - availableSinceRef.current > IGNORE_TIMEOUT_MS;
        if (!isUnsafeRoute(location.pathname) || ignoredTooLong) {
            window.location.reload();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    if (!visible || dismissed) return null;

    return (
        <div
            role="status"
            className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-4 sm:bottom-4 z-[1100] sm:w-80
                glass-strong border border-azure/30 rounded-lg px-4 py-3 shadow-lg
                flex items-center gap-3 animate-slide-up"
        >
            <span className="text-azure-deep shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M21 12a9 9 0 1 1-3-6.7" />
                    <path d="M21 3v6h-6" />
                </svg>
            </span>
            <p className="text-sm text-ink flex-1 min-w-0">A new version of NEXORA is ready.</p>
            <button
                onClick={() => window.location.reload()}
                className="text-sm font-medium text-azure-deep hover:underline shrink-0"
            >
                Reload
            </button>
            <button
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
                className="text-ash hover:text-ink transition-colors shrink-0"
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}
