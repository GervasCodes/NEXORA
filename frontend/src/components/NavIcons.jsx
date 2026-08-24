import GuidesNavIcon from "./GuidesNavIcon";

// Small hand-drawn icon set for the header nav (Phase 3: Header UI).
// Kept as plain inline SVGs - same style already used for the cart/menu
// icons in Header.jsx - rather than pulling in an icon library dependency
// the rest of the project doesn't otherwise use.
//
// Every icon takes just `className` so callers size/color them the same
// way they'd style any other element (`currentColor` stroke, no fill).

const base = {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
};

// Return-to-home shortcut - used anywhere a user might be several taps
// deep (control panels, detail pages, the 404 screen) and needs a single
// explicit way back to "/" instead of repeatedly pressing back.
export function HomeIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M4 11.5 12 4l8 7.5" />
            <path d="M6 10v9.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10" />
            <path d="M10 20.5V14h4v6.5" />
        </svg>
    );
}

export function BrowseIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <circle cx="12" cy="12" r="9" />
            <path d="m14.8 9.2-1.6 4.4-4.4 1.6 1.6-4.4z" />
        </svg>
    );
}

// Nexora Services - a plain calendar glyph (bookable listings), kept in
// the same hand-drawn single-path style as the icons around it rather
// than a literal "briefcase" - a calendar reads more clearly as
// "something you book" at nav-icon size.
export function ServicesIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
            <path d="M3.5 9.5h17M8 3v3M16 3v3" />
        </svg>
    );
}

export function DashboardIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <rect x="3" y="3" width="7" height="9" rx="1.5" />
            <rect x="14" y="3" width="7" height="5" rx="1.5" />
            <rect x="14" y="12" width="7" height="9" rx="1.5" />
            <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
    );
}

export function DeliveryIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <rect x="1" y="7" width="13" height="9" rx="1.2" />
            <path d="M14 10h4l4 3.2V16h-8z" />
            <circle cx="6" cy="18.5" r="1.6" />
            <circle cx="17" cy="18.5" r="1.6" />
        </svg>
    );
}

export function AdminIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M12 2 4 5v6c0 5 3.4 8.6 8 11 4.6-2.4 8-6 8-11V5z" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    );
}

export function MessagesIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M4 5h16v11H8l-4 4z" />
        </svg>
    );
}

export function OrdersIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M3 8 12 3l9 5v8l-9 5-9-5z" />
            <path d="M3 8l9 5 9-5M12 13v8" />
        </svg>
    );
}

export function DisputesIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M12 3 2 20h20z" />
            <path d="M12 9v5" />
            <circle cx="12" cy="17" r="0.15" fill="currentColor" stroke="none" />
        </svg>
    );
}

export function SavedIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M12 20s-7.5-4.6-9.8-9.1C.6 7.6 2 4.5 5.2 4a4.6 4.6 0 0 1 6.8 2 4.6 4.6 0 0 1 6.8-2c3.2.5 4.6 3.6 3 6.9C19.5 15.4 12 20 12 20z" />
        </svg>
    );
}

// A buyer's own bookings (Phase 2: Booking Infrastructure) - a calendar
// with a checkmark, so it reads distinctly from ServicesIcon's plain
// calendar (browsing bookable listings) at nav-icon size.
export function BookingsIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
            <path d="M3.5 9.5h17M8 3v3M16 3v3" />
            <path d="m8.5 14 2 2 4-4" />
        </svg>
    );
}

export function CartIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
    );
}

export function AccountIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" />
        </svg>
    );
}

// Wallet / earnings - used by the seller Wallet tab and the delivery
// agent Earnings tab in MobileBottomNav.jsx (Phase 6: Mobile Navigation
// Unification). Distinct from CartIcon (a shopping cart) since these
// represent a running balance, not items to purchase.
export function WalletIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <rect x="2.5" y="6" width="19" height="13" rx="2" />
            <path d="M2.5 10h19" />
            <circle cx="17.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
        </svg>
    );
}

// Loyalty points - a star badge, distinct from AffiliateIcon's share
// nodes and from AdminIcon's shield-checkmark at nav-icon size.
export function LoyaltyIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />
        </svg>
    );
}

// Affiliate / referrals - three linked nodes, reading as "share this
// with your network" rather than a running balance (WalletIcon) or a
// crowd of people (GroupBuysIcon).
export function AffiliateIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <circle cx="5.5" cy="12" r="2.2" />
            <circle cx="18.5" cy="5.5" r="2.2" />
            <circle cx="18.5" cy="18.5" r="2.2" />
            <path d="M7.5 10.9 16.5 6.6M7.5 13.1l9 4.3" />
        </svg>
    );
}

// Group buys - two overlapping people, distinct from AccountIcon's
// single person at nav-icon size.
export function GroupBuysIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <circle cx="9" cy="8.5" r="3.2" />
            <path d="M3 20c0-3.6 2.7-6.2 6-6.2s6 2.6 6 6.2" />
            <circle cx="17.5" cy="8" r="2.3" />
            <path d="M15.6 13.9c2.5.4 4.4 2.7 4.4 5.6" />
        </svg>
    );
}

// Live selling - a broadcast/play glyph (signal arcs + play triangle),
// distinct from MessagesIcon's chat bubble.
export function LiveSellingIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M4.8 6.3a9 9 0 0 0 0 11.4M19.2 6.3a9 9 0 0 1 0 11.4" />
            <circle cx="12" cy="12" r="6.5" />
            <path d="M10.3 9.5v5l4-2.5z" fill="currentColor" stroke="none" />
        </svg>
    );
}

export function SignInIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M11 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h6" />
            <path d="M15 8l4 4-4 4M9 12h10" />
        </svg>
    );
}

export function SignOutIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M13 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h7" />
            <path d="M20 12H9M16 8l4 4-4 4" />
        </svg>
    );
}

// One lookup so Header.jsx can pick an icon purely from a link's `to`
// path, without every call site needing its own if/else chain.
//
// Every entry here used to point at a *specific* icon except Wallet,
// Loyalty, Affiliate, Group buys and Guides - those five routes had no
// entry at all, so Header.jsx's `NAV_ICON_BY_PATH[link.to] || CartIcon`
// fallback silently rendered the shopping-cart icon for all of them.
// They're now each their own glyph so the nav row (and the mobile
// drawer, which reads from this same map) doesn't show five identical
// cart icons next to the real cart.
export const NAV_ICON_BY_PATH = {
    "/products": BrowseIcon,
    "/services": ServicesIcon,
    "/seller": DashboardIcon,
    "/delivery": DeliveryIcon,
    "/admin": AdminIcon,
    "/messages": MessagesIcon,
    "/orders": OrdersIcon,
    "/bookings": BookingsIcon,
    "/disputes": DisputesIcon,
    "/saved": SavedIcon,
    "/cart": CartIcon,
    "/account": AccountIcon,
    "/account/wallet": WalletIcon,
    "/loyalty": LoyaltyIcon,
    "/affiliate": AffiliateIcon,
    "/group-buys": GroupBuysIcon,
    "/live-selling": LiveSellingIcon,
    "/guides": GuidesNavIcon
};
