/**
 * statusMeta (Phase 4 remediation).
 *
 * Every lifecycle status shown to a buyer/seller was previously mapped
 * to a color/label in its own page: Orders.jsx had `statusStyles` with
 * the raw (untranslated, English-only) `order.status` printed straight
 * into the badge; Returns.jsx did the same with `.replace("_", " ")`;
 * DisputeDetail.jsx had its own `STATUS_STYLES` with no icon; only
 * BookingStatusBadge.jsx got the full treatment (style + icon +
 * translation). Four parallel, drifting copies for five status
 * vocabularies that are conceptually the same kind of thing. This file
 * is the one table; <StatusBadge domain status /> (ui/StatusBadge.jsx)
 * is the one component that renders it.
 *
 * `style` is a tone name shared with EmptyState's TONES where it lines
 * up (neutral/teal/mango/coral/azure); a couple of extra tones are
 * added here for states that don't fit that palette (e.g. a filled
 * "completed" badge).
 */

const ICONS = {
    clock: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <circle cx="12" cy="12" r="10" /><path d="M12 7v5l3 3" />
        </svg>
    ),
    pulse: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <path d="M3 12h4l2-7 4 14 2-7h6" />
        </svg>
    ),
    truck: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <path d="M3 7h11v9H3zM14 11h4l3 3v2h-7z" /><circle cx="7" cy="18" r="1.5" /><circle cx="17" cy="18" r="1.5" />
        </svg>
    ),
    check: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    ),
    x: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" />
        </svg>
    ),
    undo: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <path d="M3 10h11a4 4 0 0 1 0 8h-1M3 10l4-4M3 10l4 4" />
        </svg>
    ),
    flag: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <path d="M5 21V4h13l-3 4 3 4H5" />
        </svg>
    ),
    search: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
    ),
    box: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7" />
        </svg>
    ),
    users: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
            <circle cx="9" cy="8" r="3" /><path d="M2 20c0-3 3-5 7-5s7 2 7 5M17 11a3 3 0 1 0 0-6M22 20c0-2.5-2-4.2-4.5-4.8" />
        </svg>
    )
};

// style: a tone name consumed by StatusBadge's TONE_CLASSES.
const DOMAINS = {
    order: {
        pending: { style: "neutral", icon: "clock" },
        processing: { style: "azure", icon: "pulse" },
        shipped: { style: "mango", icon: "truck" },
        delivered: { style: "teal-solid", icon: "check" },
        cancelled: { style: "coral", icon: "x" }
    },
    booking: {
        pending: { style: "neutral", icon: "clock" },
        confirmed: { style: "teal", icon: "check" },
        active: { style: "mango", icon: "pulse" },
        completed: { style: "teal-solid", icon: "check" },
        cancelled: { style: "coral", icon: "x" },
        refunded: { style: "abyss", icon: "undo" },
        rejected: { style: "coral", icon: "x" }
    },
    dispute: {
        open: { style: "mango", icon: "flag" },
        under_review: { style: "azure", icon: "search" },
        resolved: { style: "teal-solid", icon: "check" },
        rejected: { style: "coral", icon: "x" },
        withdrawn: { style: "neutral", icon: "undo" }
    },
    return: {
        requested: { style: "neutral", icon: "clock" },
        approved: { style: "azure", icon: "check" },
        rejected: { style: "coral", icon: "x" },
        shipped_back: { style: "mango", icon: "truck" },
        received: { style: "azure", icon: "box" },
        refunded: { style: "teal-solid", icon: "undo" },
        cancelled: { style: "coral", icon: "x" }
    },
    groupBuy: {
        open: { style: "mango", icon: "users" },
        successful: { style: "teal-solid", icon: "check" },
        failed: { style: "coral", icon: "x" },
        cancelled: { style: "coral", icon: "x" }
    }
};

/**
 * Returns `{ style, icon, translationKey }` for a status within a
 * domain, falling back to a neutral/generic look for any status value
 * not in the table above (new ENUM value added on the backend without
 * a matching frontend update yet) rather than throwing or rendering
 * nothing.
 */
export function getStatusMeta(domain, status) {
    const entry = DOMAINS[domain]?.[status];
    const icon = ICONS[entry?.icon] || null;
    return {
        style: entry?.style || "neutral",
        icon,
        translationKey: `${domain}.status.${status}`
    };
}

export const STATUS_DOMAINS = DOMAINS;
