// Shared inline SVG icon set (Phase 5: Icon & Empty-State Consistency).
//
// NavIcons.jsx is specifically the header/nav-row icon set keyed by
// route - these are the rest: star ratings, status checkmarks, chat/
// call actions, and delivery-agent vehicle types, all of which
// previously rendered as raw emoji (★ ✓ ✕ 💬 📞 🚲 🏍️ 🛺 🚗 🚐 🚚 🛵
// ☺ 📎 ⏳ ←) sprinkled through components/. Emoji glyphs render
// differently per OS/browser font (a different star shape, a
// different smiley) and visually clash with the rest of the app's
// hand-drawn, currentColor-stroke icon language - these are plain
// inline SVGs in that same style so every icon in the app looks like
// it belongs to the same set.
//
// Every icon takes just `className` so callers size/color them the
// same way they'd style any other element.

const base = {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
};

export function CheckIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="m4.5 12.5 5 5 10-11" />
        </svg>
    );
}

export function CloseIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="m5 5 14 14M19 5 5 19" />
        </svg>
    );
}

// `filled` toggles a solid vs outline star, so this one component
// covers both a read-only "3.5 of 5" rating display and an
// interactive rating input's hover/selected state (previously ★ for
// filled, plain text color swap for empty - now an actual outline).
export function StarIcon({ className, filled = true }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill={filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
            className={className}
        >
            <path d="m12 3.5 2.6 5.4 5.9.9-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9-4.3-4.1 5.9-.9z" />
        </svg>
    );
}

export function ChatIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M4 5h16v11H8l-4 4z" />
        </svg>
    );
}

export function PhoneIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M6 3h3l1.4 4.3-2 1.6a11.2 11.2 0 0 0 6.7 6.7l1.6-2L21 15v3a2 2 0 0 1-2.2 2C10.6 19.6 4.4 13.4 4 6.2A2 2 0 0 1 6 3Z" />
        </svg>
    );
}

export function BackArrowIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
    );
}

export function PaperclipIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M17 7.5 8.7 15.8a3 3 0 0 1-4.2-4.2l8.5-8.5a4.5 4.5 0 1 1 6.3 6.3L10.8 17.9" />
        </svg>
    );
}

// Chat "react" affordance (MessageBubble.jsx) - a plain smiley,
// standing in for the emoji-reaction-picker trigger without itself
// being a specific emoji.
export function SmileyIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <circle cx="12" cy="12" r="9" />
            <path d="M8.3 14.3c1 1.4 2.3 2.1 3.7 2.1s2.7-.7 3.7-2.1" />
            <path d="M9 9.7h.01M15 9.7h.01" strokeWidth="2.6" />
        </svg>
    );
}

export function HourglassIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M6.5 3h11M6.5 21h11" />
            <path d="M7.5 3c0 4.2 2.3 5.7 4.5 7.5-2.2 1.8-4.5 3.3-4.5 7.5h9c0-4.2-2.3-5.7-4.5-7.5C14.5 8.7 16.5 7.2 16.5 3" />
        </svg>
    );
}

// Delivery-agent vehicle glyphs (TrackingWidget.jsx, and available for
// CourierDetailsCard.jsx) - previously raw transport emoji keyed off
// `agent_vehicle_type`. Kept as one icon per type rather than a single
// generic "vehicle" glyph so the courier's actual ride is still
// recognizable at a glance, matching what the emoji set showed.
export function BicycleIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <circle cx="5.5" cy="17.5" r="3.2" />
            <circle cx="18.5" cy="17.5" r="3.2" />
            <path d="M5.5 17.5 10 8h5l3.5 9.5M10 8l3.2 5.5H8.3" />
        </svg>
    );
}

export function MotorcycleIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <circle cx="5.5" cy="17.5" r="2.8" />
            <circle cx="18.5" cy="17.5" r="2.8" />
            <path d="M8 17.5h7l-1.8-5.5h-4M13.5 11.2 16 8h3.2M5.5 17.5 9 11.2" />
        </svg>
    );
}

export function TukTukIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M4.5 17.5V11a2 2 0 0 1 2-2h5.5l3 4h3a1.5 1.5 0 0 1 1.5 1.5v3" />
            <path d="M4.5 17.5h1.3M9.5 17.5h5M18.3 17.5h1.2" />
            <circle cx="7" cy="17.5" r="2" />
            <circle cx="17" cy="17.5" r="2" />
        </svg>
    );
}

export function CarIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <path d="M3.5 16v-3.2l2.3-4.4a2 2 0 0 1 1.8-1.1h8.8a2 2 0 0 1 1.8 1.1l2.3 4.4V16" />
            <path d="M3.5 16h17" />
            <circle cx="7.5" cy="16.7" r="1.8" />
            <circle cx="16.5" cy="16.7" r="1.8" />
        </svg>
    );
}

export function VanIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <rect x="2.5" y="8" width="13" height="8.5" rx="1" />
            <path d="M15.5 11h3.3l2.7 2.5v3h-6" />
            <circle cx="6.5" cy="18" r="1.7" />
            <circle cx="17.5" cy="18" r="1.7" />
        </svg>
    );
}

export function TruckIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <rect x="1.5" y="7.5" width="12" height="8.5" rx="1" />
            <path d="M13.5 10.5h3.3l3.2 3v2.5h-6.5" />
            <circle cx="5.5" cy="18" r="1.7" />
            <circle cx="17" cy="18" r="1.7" />
        </svg>
    );
}

// Fallback for a vehicle type with no dedicated glyph above (mirrors
// the emoji map's `|| "🛵"` fallback) - a moped, distinct from the
// heavier MotorcycleIcon by its smaller step-through frame.
export function MopedIcon({ className }) {
    return (
        <svg {...base} className={className}>
            <circle cx="6" cy="17.5" r="2.6" />
            <circle cx="17.5" cy="17.5" r="2.6" />
            <path d="M8.4 17.5h5.6l-1.3-5H9.7M14.6 12.5 17 9.2h2.5M6 17.5 9 12.5" />
        </svg>
    );
}

export const VEHICLE_ICON_BY_TYPE = {
    bicycle: BicycleIcon,
    motorcycle: MotorcycleIcon,
    tuktuk: TukTukIcon,
    car: CarIcon,
    van: VanIcon,
    truck: TruckIcon
};

export const DEFAULT_VEHICLE_ICON = MopedIcon;
