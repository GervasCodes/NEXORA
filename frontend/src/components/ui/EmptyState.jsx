/**
 * Shared EmptyState component - Phase 1 Design System Extraction.
 *
 * Extracted from the inline empty-state markup in ProductGrid.jsx and
 * retrofitted onto Orders/Bookings, which previously hand-rolled a
 * plainer version of the same layout with no icon. `icon` accepts any
 * SVG element so callers can swap in a context-appropriate glyph;
 * defaults to a generic "search" circle to match the original.
 */
export default function EmptyState({ title, hint, action, icon }) {
    return (
        <div className="text-center py-24 animate-slide-up">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-line/40 flex items-center justify-center">
                {icon || (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-ash">
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
