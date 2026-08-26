import { useEffect, useState } from "react";

// Extracted out of InstallPrompt.jsx (Phase 5, Resilience & Growth) so
// Footer.jsx's PWA-install callout (Phase 5, Visual Polish & Metadata) can
// drive the same browser install flow instead of a second
// beforeinstallprompt listener with its own copy of this logic.
//
// Chrome/Edge/Android fire "beforeinstallprompt" and then suppress their
// own default install UI unless the page calls preventDefault() and holds
// onto the event to replay later. iOS Safari never fires this event at all
// - there, "Add to Home Screen" is a manual Share-sheet action, so
// `canInstall` stays false on iOS and callers should hide/adjust their UI
// accordingly rather than showing a button that can never do anything.
export const INSTALL_DISMISSED_KEY = "nexora_install_prompt_dismissed";

export default function useInstallPrompt() {
    const [deferredEvent, setDeferredEvent] = useState(null);
    const [installed, setInstalled] = useState(false);

    useEffect(() => {
        const handleBeforeInstallPrompt = (event) => {
            event.preventDefault();
            setDeferredEvent(event);
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    }, []);

    // Once installed (this tab or another), stop offering to install again
    // - "appinstalled" fires regardless of which UI triggered it.
    useEffect(() => {
        const handleInstalled = () => {
            setInstalled(true);
            setDeferredEvent(null);
        };
        window.addEventListener("appinstalled", handleInstalled);
        return () => window.removeEventListener("appinstalled", handleInstalled);
    }, []);

    const promptInstall = async () => {
        if (!deferredEvent) return;
        deferredEvent.prompt();
        // The outcome ("accepted"/"dismissed") isn't acted on beyond
        // clearing the stored event - a browser's install prompt can only
        // be shown once per captured event either way.
        await deferredEvent.userChoice.catch(() => {});
        setDeferredEvent(null);
    };

    return {
        // True once a beforeinstallprompt event is captured and not yet
        // consumed/dismissed - callers use this to decide whether to
        // render an install control at all.
        canInstall: !!deferredEvent && !installed,
        installed,
        promptInstall
    };
}
