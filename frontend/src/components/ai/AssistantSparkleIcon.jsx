// Shared Nexora Assistant sparkle icon — used everywhere an AI surface
// needs to visually attribute itself (launcher button, chat drawer,
// inline advisory cards). Previously duplicated inline in
// NexoraAIButton.jsx and NexoraAIDrawer.jsx, and defined/exported from
// NexoraFraudExplain.jsx for NexoraAvailabilitySuggestion.jsx and
// NexoraDisputeCopilot.jsx to import - all five now import it from here.
export default function AssistantSparkleIcon({ className = "w-4 h-4" }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M12 3v3M12 18v3M4.2 12H3M21 12h-1.2M6 6l1.5 1.5M18 18l-1.5-1.5M18 6l-1.5 1.5M6 18l1.5-1.5" />
            <circle cx="12" cy="12" r="4" />
        </svg>
    );
}
