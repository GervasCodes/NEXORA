/**
 * PulseBar - a thin, non-blocking, breathing bar for background activity
 * (refetching with content already on screen, offline-queue sync, socket
 * reconnecting). It never replaces content and never takes focus; it only
 * says "still working".
 *
 *  - position="inline": sits in normal flow (top of a list/section)
 *  - position="top":    fixed to the viewport top, under the route bar
 */
export default function PulseBar({ active, position = "inline", label, className = "" }) {
    if (!active) return null;
    const place = position === "top" ? "fixed top-[3px] left-0 right-0 z-[var(--z-float)] pointer-events-none" : "relative w-full";
    return (
        <div role="status" className={`${place} h-0.5 overflow-hidden ${className}`}>
            <span className="sr-only">{label}</span>
            <div aria-hidden="true" className="h-full w-full origin-left bg-gradient-to-r from-azure via-mango to-coral animate-pulse-bar" />
        </div>
    );
}
