import { useEffect, useState } from "react";

// Phase 5 (Resilience & Growth). Listens for the "nexora:sw-updated"
// event dispatched from main.jsx (see the comment there for why this
// isn't just an automatic reload). Rendered once, near the root of the
// app, regardless of route - an update can become available on any page.
export default function UpdateAvailableBanner() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handleUpdate = () => setVisible(true);
        window.addEventListener("nexora:sw-updated", handleUpdate);
        return () => window.removeEventListener("nexora:sw-updated", handleUpdate);
    }, []);

    if (!visible) return null;

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
                onClick={() => setVisible(false)}
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
