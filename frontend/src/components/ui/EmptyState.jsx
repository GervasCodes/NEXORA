/**
 * Shared EmptyState component - Phase 1 Design System Extraction.
 *
 * Extracted from the inline empty-state markup in ProductGrid.jsx and
 * retrofitted onto Orders/Bookings, which previously hand-rolled a
 * plainer version of the same layout with no icon. `icon` accepts any
 * SVG element so callers can swap in a context-appropriate glyph;
 * defaults to a generic "search" circle to match the original.
 *
 * `tone` (Phase 5: Icon & Empty-State Consistency) tints the icon
 * circle so different empty states read as visually distinct at a
 * glance instead of every context sharing the exact same neutral grey
 * badge - a caller passing a cart/orders/bookings icon alongside a
 * matching tone (e.g. "empty cart" vs "no orders yet") no longer looks
 * like the same component reused verbatim with only the glyph swapped.
 * Callers that don't set an explicit text color on their `icon` inherit
 * the tone's color via currentColor; existing callers that already
 * hardcode a color (e.g. `text-ash`) are unaffected either way.
 */
const TONES = {
    neutral: "bg-line/40 text-ash",
    teal: "bg-teal/10 text-teal",
    mango: "bg-mango/15 text-mango-dark",
    coral: "bg-coral/10 text-coral",
    azure: "bg-azure/10 text-azure"
};

export default function EmptyState({ title, hint, action, icon, tone = "neutral" }) {
    return (
        // D1 (Phase 4 remediation): role="status" so a screen-reader user
        // navigating into a list that turned out to be empty hears "Nothing
        // here yet" (or the caller's title) announced, the same way a
        // sighted user just sees it - previously this was a silent <div>.
        <div className="text-center py-24 animate-slide-up" role="status">
            <div
                className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${TONES[tone] || TONES.neutral}`}
                aria-hidden="true"
            >
                {icon || (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m21 21-4.3-4.3" />
                    </svg>
                )}
            </div>
            <p className="font-display text-xl mb-1">{title || "Nothing here yet"}</p>
            {hint && <p className="text-ash text-sm">{hint}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
