import { useEffect, useState } from "react";

// Extracted out of InstallPrompt.jsx ( Resilience & Growth) so
// Footer.jsx's PWA-install callout ( Visual Polish & Metadata) can
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

// Phase 5 (production error fixes): the browser only ever fires
// "beforeinstallprompt" once, and the resulting event object can only
// have .prompt() called on it once, full stop - it doesn't matter which
// piece of UI calls it. This hook is used independently by BOTH
// InstallPrompt.jsx (the floating banner) and Footer.jsx's
// InstallCallout, mounted at the same time. Keeping the captured event
// in per-component useState (the previous version) meant each instance
// held its OWN copy of the same underlying event: if one UI consumed
// it, the other's copy went stale, and calling .prompt() on an
// already-used event is exactly what produced the console warning
// ("preventDefault() called. The page must call prompt() to show the
// banner.") repeating on every load. Moving the captured event to a
// module-level singleton (shared by every hook instance, with a small
// subscriber list to trigger re-renders) means there's exactly one
// event and exactly one place that can consume it - whichever UI the
// person actually clicks claims it and clears it for every other
// consumer at the same time.
let sharedDeferredEvent = null;
let sharedInstalled = false;
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener());

const handleBeforeInstallPrompt = (event) => {
    event.preventDefault();
    sharedDeferredEvent = event;
    notify();
};

const handleAppInstalled = () => {
    sharedInstalled = true;
    sharedDeferredEvent = null;
    notify();
};

// Registered once at module load, not per-component-mount/unmount - a
// component unmounting (e.g. the banner being dismissed) must never
// tear down the listener that's the only thing capturing this
// once-per-session browser event for every other consumer.
if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
}

export default function useInstallPrompt() {
    // No local copy of the event itself - just a re-render trigger so
    // this component reflects the shared singleton's current state.
    const [, forceRender] = useState(0);

    useEffect(() => {
        const onChange = () => forceRender((n) => n + 1);
        listeners.add(onChange);
        return () => listeners.delete(onChange);
    }, []);

    const promptInstall = async () => {
        if (!sharedDeferredEvent) return;
        // Claim and clear the shared event BEFORE calling .prompt() - so
        // any other mounted instance (the other UI surface) immediately
        // sees canInstall flip to false and can't attempt to reuse the
        // same, now-consumed event.
        const event = sharedDeferredEvent;
        sharedDeferredEvent = null;
        notify();

        event.prompt();
        // The outcome ("accepted"/"dismissed") isn't acted on beyond
        // this - a browser's install prompt can only be shown once per
        // captured event either way.
        await event.userChoice.catch(() => {});
    };

    return {
        // True once a beforeinstallprompt event is captured and not yet
        // consumed/dismissed - callers use this to decide whether to
        // render an install control at all.
        canInstall: !!sharedDeferredEvent && !sharedInstalled,
        installed: sharedInstalled,
        promptInstall
    };
}
