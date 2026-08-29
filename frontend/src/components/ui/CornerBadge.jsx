// Small badge pinned to a corner of a relatively-positioned image
// container (product thumbnails, department/category covers). Extracted
// (UI/UX Overlap Remediation, Phase 6) from markup that used to be
// hand-duplicated per component - ProductCard's "Verified" tag,
// DepartmentCard's "Sponsored"/"N new" pills - which is how they drifted
// out of sync with each other (only ProductCard ever got a `compact`,
// icon-only mode for its smallest thumbnail size).
//
// Props:
//  - corner: "top-left" | "top-right" (default "top-right")
//  - shape: "tag" (small rounded rect, e.g. a verification badge) or
//    "pill" (fully rounded, e.g. Sponsored/New) - default "tag"
//  - tone: className string for background/text color, e.g. "bg-teal text-frost"
//  - icon: optional svg/node shown before the label
//  - label: the badge text
//  - compact: when true, only the icon renders visually and the label
//    becomes screen-reader-only text (`sr-only`) - use this on small
//    thumbnails where a text label would crowd an adjacent button/badge
export default function CornerBadge({ corner = "top-right", shape = "tag", tone = "", icon, label, compact = false }) {
    const positionClass = corner === "top-left" ? "top-2 left-2" : "top-2 right-2";
    const shapeClass = shape === "pill" ? "px-2 py-1 rounded-full" : compact ? "p-1 rounded" : "px-1.5 py-0.5 rounded";

    return (
        <span
            className={`absolute ${positionClass} text-[10px] font-semibold uppercase tracking-wide flex items-center gap-0.5 ${shapeClass} ${tone}`}
        >
            {icon}
            {label && <span className={compact ? "sr-only" : ""}>{label}</span>}
        </span>
    );
}
