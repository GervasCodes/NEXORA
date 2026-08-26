import { useState } from "react";
import useInstallPrompt, { INSTALL_DISMISSED_KEY } from "../hooks/useInstallPrompt";

// Phase 5 (Resilience & Growth). The beforeinstallprompt/appinstalled
// wiring itself now lives in useInstallPrompt (extracted in Phase 5,
// Visual Polish & Metadata, so Footer.jsx's install callout can share it)
// - this component is just the dismissible banner UI on top of it.
// (iOS Safari never fires beforeinstallprompt at all - there, "Add to
// Home Screen" is a manual Share-sheet action; the apple-mobile-web-app-*
// meta tags added in an earlier phase are what make that manual path
// produce a proper standalone app rather than a browser-chrome shortcut.)
export default function InstallPrompt() {
    const { canInstall, promptInstall } = useInstallPrompt();
    const [dismissed, setDismissed] = useState(() => localStorage.getItem(INSTALL_DISMISSED_KEY) === "1");

    // Respect an earlier dismissal for the rest of this browser profile -
    // a banner that reappears on every visit after someone already said
    // "not now" is the kind of thing that makes people distrust a PWA
    // prompt rather than use it.
    const visible = canInstall && !dismissed;

    const dismiss = () => {
        setDismissed(true);
        localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
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
                onClick={() => { setDismissed(true); promptInstall(); }}
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
