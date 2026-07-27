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

export function BrowseIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <circle cx="12" cy="12" r="9" />
            <path d="m14.8 9.2-1.6 4.4-4.4 1.6 1.6-4.4z" />
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
export const NAV_ICON_BY_PATH = {
    "/products": BrowseIcon,
    "/seller": DashboardIcon,
    "/delivery": DeliveryIcon,
    "/admin": AdminIcon,
    "/messages": MessagesIcon,
    "/orders": OrdersIcon,
    "/disputes": DisputesIcon,
    "/saved": SavedIcon,
    "/cart": CartIcon,
    "/account": AccountIcon
};
