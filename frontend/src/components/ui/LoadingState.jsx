/**
 * Shared LoadingState component - Phase 10 (readability & shared states).
 *
 * Sibling to EmptyState/ErrorState: a small, centered placeholder for
 * spots that previously rendered a bare "Loading…" string with no
 * visual weight and nothing for assistive tech. Not a replacement for
 * SkeletonList/SkeletonAvatarList, which still fit list-shaped content
 * better - this is for the smaller inline spots (a panel, a card body,
 * a "load more" footer) where a full skeleton grid is overkill.
 */
export default function LoadingState({ label }) {
    return (
        // role="status" (not "alert"): a view that is still loading isn't
        // an error, so this should be announced politely, same as
        // EmptyState - matches the pattern used there.
        <div className="text-center py-12 animate-fade-in" role="status">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="w-6 h-6 mx-auto mb-2 text-ash animate-spin"
                aria-hidden="true"
            >
                <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
            </svg>
            <p className="text-ash text-sm">{label || "Loading…"}</p>
        </div>
    );
}
