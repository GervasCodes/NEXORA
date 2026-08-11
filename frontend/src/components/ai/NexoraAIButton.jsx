import { useAIAssistant } from "../../context/AIAssistantContext";

// Placement rules (roadmap Part B, "Design / placement"): bottom-right,
// glass-strong surface, azure gradient icon, sits above
// MobileBottomNav (fixed bottom-0 h-[52px]-ish + safe-area) on mobile so
// it never overlaps it, labeled "Nexora AI" (not a generic bubble icon).
// Only mounted for buyer/guest layouts in App.jsx - seller/admin/
// delivery get their own B2/B3 entry points later, not this one.
export default function NexoraAIButton() {
    const assistant = useAIAssistant();
    if (!assistant) return null;

    return (
        <button
            type="button"
            onClick={() => assistant.open()}
            aria-label="Open Nexora AI"
            className="fixed right-4 z-50 flex items-center gap-2 rounded-full glass-strong px-4 py-3
                       bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6
                       shadow-lg hover:scale-[1.03] active:scale-[0.98] transition-transform"
        >
            <span className="h-6 w-6 rounded-full bg-gradient-to-br from-azure-light to-azure-deep flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M12 3v3M12 18v3M4.2 12H3M21 12h-1.2M6 6l1.5 1.5M18 18l-1.5-1.5M18 6l-1.5 1.5M6 18l1.5-1.5" />
                    <circle cx="12" cy="12" r="4" />
                </svg>
            </span>
            <span className="text-sm font-medium text-abyss hidden sm:inline">Nexora AI</span>
        </button>
    );
}
