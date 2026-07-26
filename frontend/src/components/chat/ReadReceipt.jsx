// status: "sent" (single check) | "delivered" (double check, muted) |
// "read" (double check, azure). Mirrors WhatsApp/Telegram's convention
// so it needs no label to be understood.
export default function ReadReceipt({ status }) {
    const color = status === "read" ? "text-azure" : "text-frost/60";

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
