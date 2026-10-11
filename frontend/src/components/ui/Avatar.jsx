import { useState } from "react";

// Phase 6 (New UI/UX & Imagery Additions, item 19): shared avatar used
// wherever a person's name currently rendered as plain text (or, in
// Messages.jsx's case, a hand-rolled initials circle). Renders a photo
// when one is available; falls back to initials on a colored circle
// otherwise. `users.photo_url` (migration 091) now backs this - every
// call site that has a user object in scope passes `src`, and still
// falls back to initials for any account that hasn't uploaded a photo.
//
// Same rotating gradient palette as DepartmentCard.jsx/ServiceCategoryCard.jsx,
// reused verbatim for visual consistency with the rest of the app's
// placeholder-cover treatment. Picked deterministically from the
// person's name (a simple char-code hash) so the same person always
// gets the same color instead of a different one on every render.
const FALLBACK_GRADIENTS = [
    "linear-gradient(135deg, #1D4ED8 0%, #6EA8FE 100%)",
    "linear-gradient(135deg, #0F766E 0%, #2DD4BF 100%)",
    "linear-gradient(135deg, #C2410C 0%, #FB923C 100%)",
    "linear-gradient(135deg, #075985 0%, #38BDF8 100%)",
    "linear-gradient(135deg, #7C2D12 0%, #EA580C 100%)",
    "linear-gradient(135deg, #134E4A 0%, #14B8A6 100%)",
    "linear-gradient(135deg, #1E3A8A 0%, #9FC1F2 100%)"
];

const SIZE_CLASSES = {
    xs: "w-6 h-6 text-[10px]",
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-14 h-14 text-lg"
};

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function initialsFor(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Props:
 *  - firstName / lastName: preferred way to identify the person (matches
 *    the `first_name`/`last_name` shape used across the API).
 *  - name: alternative single-string identifier (store name, display
 *    name) when first/last isn't the right shape for the call site.
 *  - src: optional photo URL. Falls back to initials if absent or if it
 *    fails to load.
 *  - size: "xs" | "sm" | "md" | "lg" (default "md").
 */
export default function Avatar({ firstName, lastName, name, src, size = "md", className = "" }) {
    const [imgFailed, setImgFailed] = useState(false);
    const fullName = name || [firstName, lastName].filter(Boolean).join(" ") || "?";
    const initials = initialsFor(fullName);
    const gradient = FALLBACK_GRADIENTS[hashString(fullName) % FALLBACK_GRADIENTS.length];
    const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

    if (src && !imgFailed) {
        return (
            <img
                src={src}
                alt={fullName}
                loading="lazy"
                decoding="async"
                onError={() => setImgFailed(true)}
                className={`${sizeClass} rounded-full object-cover shrink-0 ${className}`}
            />
        );
    }

    // `role="img" aria-label` rather than `aria-hidden` (Phase 2:
    // Reliability & performance groundwork - a11y fix): this used to hide
    // the fallback entirely from assistive tech, which is fine at a call
    // site that also renders the person's name as adjacent text, but
    // Avatar is a generic shared component - several call sites (an
    // online-users strip, a grid of reviewer/store avatars) use the
    // avatar as the only visible identifier, with no separate name text
    // nearby. Hiding it there removed the person's identity from
    // screen-reader output entirely. Matches the real-photo branch above,
    // which already uses `alt={fullName}`.
    return (
        <div
            role="img"
            aria-label={fullName}
            style={{ background: gradient }}
            className={`${sizeClass} rounded-full flex items-center justify-center font-display text-frost shrink-0 ${className}`}
        >
            <span aria-hidden="true">{initials}</span>
        </div>
    );
}
