import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import useInstallPrompt, {
    INSTALL_DISMISSED_KEY,
    INSTALL_OFFER_AT_KEY,
    INSTALL_OFFER_COOLDOWN_DAYS,
    MEANINGFUL_ACTION_EVENT
} from "../hooks/useInstallPrompt";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

// (Resilience & Growth). The beforeinstallprompt/appinstalled
// wiring itself now lives in useInstallPrompt (extracted in Phase 5,
// Visual Polish & Metadata, so Footer.jsx's install callout can share it)
// - this component is just the dismissible banner UI on top of it.
// (iOS Safari never fires beforeinstallprompt at all - there, "Add to
// Home Screen" is a manual Share-sheet action; the apple-mobile-web-app-*
// meta tags added in an earlier phase are what make that manual path
// produce a proper standalone app rather than a browser-chrome shortcut.)
//
// Two moments, both only ever driven by the browser's own install event
// (preventDefault is held, prompt() runs only when the person taps Install):
//  - guest on the landing page: shown on arrival, a dismissal is remembered
//    for the browser profile (unchanged behaviour);
//  - signed-in person: shown ONCE, right after something meaningful (cart
//    add, save, order placed - see notifyMeaningfulAction). Once shown it is
//    not offered again for INSTALL_OFFER_COOLDOWN_DAYS, whether the person
//    installed, dismissed or ignored it. Never on checkout, admin, the swipe
//    feed, auth pages or an open conversation.
const COOLDOWN_MS = INSTALL_OFFER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

function readStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Best-effort: state below still hides the banner for this session.
    }
}

function offerCooldownPassed() {
    const last = Number(readStorage(INSTALL_OFFER_AT_KEY));
    return !Number.isFinite(last) || last <= 0 || Date.now() - last >= COOLDOWN_MS;
}

const SUPPRESSED_ROUTE = /^\/(checkout|admin|feed|login|register|forgot-password)(\/|$)|^\/messages\/[^/]+\/?$/;

export default function InstallPrompt({ guestLanding = false }) {
    const { canInstall, promptInstall } = useInstallPrompt();
    const { user } = useAuth();
    const { t } = useLanguage();
    const location = useLocation();

    // Guest flow: remembered "not now".
    const [dismissed, setDismissed] = useState(() => readStorage(INSTALL_DISMISSED_KEY) === "1");

    // Signed-in flow.
    const [actionSeen, setActionSeen] = useState(false);
    const [offerShown, setOfferShown] = useState(false);
    const [offerClosed, setOfferClosed] = useState(false);

    useEffect(() => {
        if (!user || guestLanding) return undefined;
        const onAction = () => setActionSeen(true);
        window.addEventListener(MEANINGFUL_ACTION_EVENT, onAction);
        return () => window.removeEventListener(MEANINGFUL_ACTION_EVENT, onAction);
    }, [user, guestLanding]);

    const routeAllowed = !SUPPRESSED_ROUTE.test(location.pathname);
    const offerEligible = Boolean(user) && !guestLanding && actionSeen && canInstall && routeAllowed && !offerClosed;
    // Start the cooldown the moment the offer is first shown, so a reload,
    // another tab or a second action never shows it again within the window.
    const showOffer = offerEligible && (offerShown || offerCooldownPassed());

    useEffect(() => {
        if (showOffer && !offerShown) {
            setOfferShown(true);
            writeStorage(INSTALL_OFFER_AT_KEY, String(Date.now()));
        }
    }, [showOffer, offerShown]);

    const guestVisible = guestLanding && canInstall && !dismissed;
    const visible = guestVisible || showOffer;

    const dismiss = () => {
        if (guestLanding) {
            setDismissed(true);
            writeStorage(INSTALL_DISMISSED_KEY, "1");
        } else {
            setOfferClosed(true);
        }
    };

    const install = () => {
        if (guestLanding) setDismissed(true);
        else setOfferClosed(true);
        promptInstall();
    };

    if (!visible) return null;

    // Sits above the floating action stack (NexoraAIButton/SupportWidget)
    // and the phone bottom bar via --bottom-inset (index.css), so it clears
    // both with a consistent gap at every breakpoint.
    return (
        <div
            role="status"
            className="fixed bottom-[calc(8.5rem+var(--bottom-inset))] inset-x-4 sm:inset-x-auto sm:right-4 z-[var(--z-banner)] sm:w-80
                glass-strong border border-teal/30 rounded-lg px-4 py-3 shadow-lg
                flex items-center gap-3 animate-slide-up"
        >
            <span className="text-teal shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" aria-hidden="true">
                    <path d="M12 3v12m0 0-4-4m4 4 4-4" />
                    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                </svg>
            </span>
            <p className="text-sm text-ink flex-1 min-w-0">{t("install.prompt")}</p>
            <button
                onClick={install}
                className="text-sm font-medium text-teal hover:underline shrink-0 min-h-[44px] px-1"
            >
                {t("install.action")}
            </button>
            <button
                onClick={dismiss}
                aria-label={t("install.dismiss")}
                className="text-ash hover:text-ink transition-colors shrink-0 w-9 h-9 flex items-center justify-center"
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}
