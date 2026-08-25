import Button from "./Button";

/**
 * Shared ErrorState component - Phase 1 Design System Extraction.
 *
 * Previously, failed fetches were either shown as a bare `<p
 * className="text-coral">` (ProductGrid) or silently swallowed into an
 * empty list (Orders, Bookings' non-maintenance errors) - so a network
 * failure looked identical to "you have no orders". This gives failed
 * fetches their own visual state, consistent with EmptyState, plus an
 * optional retry action.
 */
export default function ErrorState({ title, hint, onRetry }) {
    return (
        // D1 (Phase 4 remediation): role="alert" (assertive live region) so
        // a screen-reader user is actually told a fetch failed, instead of
        // only seeing it - unlike EmptyState's "status" (an empty list
        // isn't urgent), a failure the user may need to act on right away.
        <div className="text-center py-24 animate-slide-up" role="alert">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-coral/10 flex items-center justify-center" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-coral">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5" />
                    <path d="M12 16h.01" />
                </svg>
            </div>
            <p className="font-display text-xl mb-1">{title || "Something went wrong"}</p>
            {hint && <p className="text-ash text-sm mb-4">{hint}</p>}
            {onRetry && (
                <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
                    Try again
                </Button>
            )}
        </div>
    );
}
