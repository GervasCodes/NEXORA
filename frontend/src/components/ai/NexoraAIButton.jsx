import { useEffect, useState } from "react";
import { useAIAssistant } from "../../context/AIAssistantContext";
import AssistantSparkleIcon from "./AssistantSparkleIcon";

// Icon-only at every breakpoint (aria-label/title carry the accessible
// name; the first-visit pulse is how new users learn what it does).
// Fixed launcher button — bottom-right, sits above MobileBottomNav on
// mobile. Buyer/guest only; admin/seller/delivery have their own entry
// points. Shows a pulsing ring to draw attention on first visit - plays
// automatically for a few seconds on first mount (not just on
// group-hover) so touch devices, which have no hover state, see it too.
const AUTO_PULSE_MS = 4000;

export default function NexoraAIButton() {
    const assistant = useAIAssistant();
    const [autoPulse, setAutoPulse] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => setAutoPulse(false), AUTO_PULSE_MS);
        return () => clearTimeout(timer);
    }, []);

    if (!assistant) return null;

    return (
        <button
            type="button"
            onClick={() => assistant.open()}
            aria-label="Open Nexora Assistant"
            title="Nexora Assistant"
            className="
                fixed right-4 z-50
                bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6
                group flex items-center justify-center
                rounded-full shadow-lg shadow-azure/25
                bg-gradient-to-br from-azure-light to-azure-deep
                w-12 h-12
                hover:shadow-azure/40 hover:scale-[1.04]
                active:scale-[0.97]
                transition-all duration-200
            "
        >
            {/* Animated halo - auto-plays once on mount, then falls back to hover-only */}
            <span
                className={`absolute inset-0 rounded-full bg-azure/30 animate-ping transition-opacity duration-300 ${
                    autoPulse ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                aria-hidden="true"
            />

            {/* Icon */}
            <span className="relative w-6 h-6 flex items-center justify-center">
                <AssistantSparkleIcon className="w-5 h-5 text-white" />
            </span>
        </button>
    );
}
