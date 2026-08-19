import { useAIAssistant } from "../../context/AIAssistantContext";

// Fixed launcher button — bottom-right, sits above MobileBottomNav on
// mobile. Buyer/guest only; admin/seller/delivery have their own entry
// points. Shows a pulsing ring to draw attention on first visit.
export default function NexoraAIButton() {
    const assistant = useAIAssistant();
    if (!assistant) return null;

    return (
        <button
            type="button"
            onClick={() => assistant.open()}
            aria-label="Open Nexora AI"
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
            {/* Animated halo */}
            <span className="absolute inset-0 rounded-full bg-azure/30 animate-ping opacity-0 group-hover:opacity-100 transition-opacity duration-300" aria-hidden="true" />

            {/* Icon */}
            <span className="relative w-5 h-5 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M12 3v3M12 18v3M4.2 12H3M21 12h-1.2M6 6l1.5 1.5M18 18l-1.5-1.5M18 6l-1.5 1.5M6 18l1.5-1.5" />
                    <circle cx="12" cy="12" r="4" />
                </svg>
            </span>

            <span className="relative text-sm font-semibold text-white hidden sm:inline tracking-wide">
                Nexora AI
            </span>
        </button>
    );
}
