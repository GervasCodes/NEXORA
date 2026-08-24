import { useEffect, useState } from "react";

// Phase 5 (Resilience & Growth). Chrome/Edge/Android fire
// "beforeinstallprompt" and then suppress their own default install UI
// unless the page calls preventDefault() and holds onto the event to
// replay later - without this component, that event fires and is
// silently discarded, and NEXORA never gets a install prompt of its own.
// (iOS Safari never fires this event at all - there, "Add to Home
// Screen" is a manual Share-sheet action; the apple-mobile-web-app-*
// meta tags added earlier this phase are what make that manual path
// produce a proper standalone app rather than a browser-chrome shortcut.)
const DISMISSED_KEY = "nexora_install_prompt_dismissed";

export default function InstallPrompt() {
    const [deferredEvent, setDeferredEvent] = useState(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handleBeforeInstallPrompt = (event) => {
            // Respect an earlier dismissal for the rest of this browser
            // profile - a banner that reappears on every visit after
            // someone already said "not now" is the kind of thing that
            // makes people distrust a PWA prompt rather than use it.
            //
            // This check has to happen BEFORE preventDefault(), not
            // after: calling preventDefault() promises the browser "I'll
            // show my own install UI instead, hang onto this event for
            // me" - if we then bail out for a dismissed user without
            // ever calling event.prompt() on it, that promise is never
            // kept. That's exactly what produced the console warning
            // ("preventDefault() called... must call prompt() to show
            // the banner") on every single page load for anyone who'd
            // dismissed the prompt once. For a dismissed user we don't
            // want to show anything at all, so we just don't intercept
            // the event in the first place.
            if (localStorage.getItem(DISMISSED_KEY) === "1") return;

            event.preventDefault();
            setDeferredEvent(event);
            setVisible(true);
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    }, []);

    // Once installed (this tab or another), stop offering to install
    // again - "appinstalled" fires regardless of which UI triggered it.
    useEffect(() => {
        const handleInstalled = () => {
            setVisible(false);
            setDeferredEvent(null);
        };
        window.addEventListener("appinstalled", handleInstalled);
        return () => window.removeEventListener("appinstalled", handleInstalled);
    }, []);

    const dismiss = () => {
        setVisible(false);
        localStorage.setItem(DISMISSED_KEY, "1");
    };

    const install = async () => {
        if (!deferredEvent) return;
        setVisible(false);
        deferredEvent.prompt();
        // The outcome ("accepted"/"dismissed") isn't acted on beyond
        // clearing the stored event - a browser's install prompt can only
        // be shown once per captured event either way.
        await deferredEvent.userChoice.catch(() => {});
        setDeferredEvent(null);
    };

    if (!visible) return null;

    return (
        <div
            role="status"
            className="fixed bottom-20 inset-x-4 sm:inset-x-auto sm:right-4 sm:bottom-20 z-[1050] sm:w-80
                glass-strong border border-teal/30 rounded-lg px-4 py-3 shadow-lg
                flex items-center gap-3 animate-slide-up"
        >
            <span className="text-teal shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M12 3v12m0 0-4-4m4 4 4-4" />
                    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                </svg>
            </span>
            <p className="text-sm text-ink flex-1 min-w-0">Install NEXORA for quicker access.</p>
            <button
                onClick={install}
                className="text-sm font-medium text-teal hover:underline shrink-0"
            >
                Install
            </button>
            <button
                onClick={dismiss}
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
