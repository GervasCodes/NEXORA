import Spinner from "./Spinner";

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
            <Spinner size="md" tone="ash" className="mx-auto mb-2" />
            <p className="text-ash text-sm">{label || "Loading…"}</p>
        </div>
    );
}
