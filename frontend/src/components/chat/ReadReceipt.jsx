// status: "sent" (single check) | "delivered" (double check, muted) |
// "read" (double check, bright). Mirrors WhatsApp/Telegram's convention
// so it needs no label to be understood. Phase 8 sub-phase 1: the "mine"
// bubble this sits on switched from flat bg-abyss to a violet-azure
// gradient (MessageBubble.jsx), so text-azure no longer has enough
// contrast against it (azure-on-azure) - bright frost for "read" vs. a
// muted frost for sent/delivered keeps the same two-state read at a
// glance without that clash.
export default function ReadReceipt({ status }) {
    const color = status === "read" ? "text-frost" : "text-frost/55";

    return (
        <span className={`inline-flex items-center animate-check-pop ${color}`} aria-label={status} title={status}>
            <svg width="15" height="10" viewBox="0 0 15 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 5L4.5 8.5L9.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                {status !== "sent" && (
                    <path d="M5.5 5L9 8.5L14 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                )}
            </svg>
        </span>
    );
}
