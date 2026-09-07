import { useEffect, useState } from "react";
import { useAIAssistant } from "../../context/AIAssistantContext";
import AssistantSparkleIcon from "./AssistantSparkleIcon";

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
            className="
                fixed right-4 z-50
                bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6
                group flex items-center gap-2.5
                rounded-full shadow-lg shadow-azure/25
                bg-gradient-to-br from-azure-light to-azure-deep
                px-4 py-2.5
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
            <span className="relative w-5 h-5 flex items-center justify-center">
                <AssistantSparkleIcon className="w-4 h-4 text-white" />
            </span>

            <span className="relative text-sm font-semibold text-white hidden sm:inline tracking-wide">
                Nexora Assistant
            </span>
        </button>
    );
}
