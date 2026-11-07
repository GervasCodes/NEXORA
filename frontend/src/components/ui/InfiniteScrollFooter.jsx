import Button from "./Button";
import Spinner from "./Spinner";
import useT from "./useT";

/**
 * InfiniteScrollFooter - renders the bottom of any paginated list in one
 * of four states:
 *   loading -> `skeleton` if given (rows/cards), otherwise a Spinner row
 *   error   -> message + Retry (so a failed page is never silent)
 *   idle    -> a manual "Load more" button (fallback for browsers that
 *              block IntersectionObserver, and the primary control when
 *              data-saver turns auto-load off)
 *   end     -> an optional end-of-list note
 *
 * Put `sentinelRef` (from useInfiniteScroll) on the sentinel it renders.
 * `error` may be a boolean or a message string; `errorMessage` overrides
 * the default copy.
 */
export default function InfiniteScrollFooter({
    sentinelRef,
    hasMore,
    loading,
    error,
    errorMessage,
    onLoadMore,
    skeleton,
    showEnd = false,
    endMessage,
    loadMoreLabel,
    className = ""
}) {
    const t = useT();
    return (
        <div className={className}>
            <div ref={sentinelRef} aria-hidden="true" />
            {loading && (
                skeleton ? (
                    <div role="status" aria-busy="true">
                        <span className="sr-only">{t("common.loading")}</span>
                        {skeleton}
                    </div>
                ) : (
                    <div role="status" className="flex items-center justify-center gap-2 py-6 text-ash text-sm">
                        <Spinner size="sm" />
                        <span>{t("common.loading")}</span>
                    </div>
                )
            )}
            {!loading && error && (
                <div role="alert" className="text-center py-6 space-y-2">
                    <p className="text-sm text-ash">{typeof error === "string" && error ? error : errorMessage || t("infinite.error")}</p>
                    <Button variant="secondary" size="sm" onClick={onLoadMore}>{t("common.tryAgain")}</Button>
                </div>
            )}
            {!loading && !error && hasMore && (
                <div className="text-center mt-6">
                    <Button variant="secondary" size="sm" onClick={onLoadMore} className="!rounded-full !px-5">
                        {loadMoreLabel || t("infinite.loadMore")}
                    </Button>
                </div>
            )}
            {!loading && !error && !hasMore && showEnd && (
                <p className="text-center text-ash text-xs mt-6">{endMessage || t("infinite.end")}</p>
            )}
        </div>
    );
}
