// Phase 12 (Messaging UI Modernization) - ConversationThread.jsx rendered
// every message in one flat list with no indication of which day a
// message belongs to, so a long-running conversation read like a single
// undifferentiated wall of bubbles. This renders between message groups
// wherever the day changes (see ConversationThread.jsx's isSameDay/
// dateSeparatorLabel helpers) - purely presentational, no state of its
// own.
//
// Phase 8 sub-phase 1: swapped the flat bg-line chip for the same frosted
// glass treatment as the new "other" message bubble, so date chips read
// as part of the same redesigned surface instead of the old flat style
// left behind mid-thread.
export default function DateSeparator({ label }) {
    return (
        <div className="flex items-center justify-center py-1" role="separator" aria-label={label}>
            <span className="text-[11px] font-medium tracking-wide uppercase text-ash backdrop-blur-md bg-paper/70 dark:bg-abyss/45 border border-ink/5 rounded-full px-3 py-1 shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
                {label}
            </span>
        </div>
    );
}
