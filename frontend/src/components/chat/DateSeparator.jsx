// Phase 12 (Messaging UI Modernization) - ConversationThread.jsx rendered
// every message in one flat list with no indication of which day a
// message belongs to, so a long-running conversation read like a single
// undifferentiated wall of bubbles. This renders between message groups
// wherever the day changes (see ConversationThread.jsx's isSameDay/
// dateSeparatorLabel helpers) - purely presentational, no state of its
// own.
export default function DateSeparator({ label }) {
    return (
        <div className="flex items-center justify-center py-1" role="separator" aria-label={label}>
            <span className="text-[11px] font-medium text-ash bg-line/40 rounded-full px-3 py-1">
                {label}
            </span>
        </div>
    );
}
