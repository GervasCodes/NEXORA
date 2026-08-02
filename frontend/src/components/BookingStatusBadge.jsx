import { useLanguage } from "../context/LanguageContext";

// Single source of truth for how a booking's lifecycle status renders as a
// badge - was previously copy-pasted (and drifting - "refunded" was missing
// in two of the three copies) across Bookings.jsx, BookingDetail.jsx and
// SellerBookings.jsx. Status values match the `bookings.status` ENUM in
// 063_services_booking_infrastructure.sql, plus 'rejected' added in
// 070_booking_rejected_status.sql (Phase 5).
const STATUS_STYLES = {
    pending: "bg-line text-ash",
    confirmed: "bg-teal/10 text-teal",
    active: "bg-mango/20 text-mango-dark",
    completed: "bg-teal text-white",
    cancelled: "bg-coral/10 text-coral",
    refunded: "bg-abyss/10 text-abyss",
    rejected: "bg-coral/10 text-coral"
};

const STATUS_ICONS = {
    pending: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <circle cx="12" cy="12" r="10" /><path d="M12 7v5l3 3" />
        </svg>
    ),
    confirmed: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    ),
    active: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
        </svg>
    ),
    completed: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    ),
    cancelled: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" />
        </svg>
    ),
    refunded: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <path d="M3 10h11a4 4 0 0 1 0 8h-1M3 10l4-4M3 10l4 4" />
        </svg>
    ),
    rejected: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" />
        </svg>
    )
};

export default function BookingStatusBadge({ status, size = "md" }) {
    const { t } = useLanguage();
    const style = STATUS_STYLES[status] || "bg-line text-ash";
    const sizeClass = size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1";

    return (
        <span className={`inline-flex items-center gap-1 font-medium rounded-full shrink-0 transition-colors ${sizeClass} ${style}`}>
            {STATUS_ICONS[status]}
            {t(`booking.status.${status}`) || status}
        </span>
    );
}
