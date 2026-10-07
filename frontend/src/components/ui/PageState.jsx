import PageLoader from "../PageLoader";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";

/**
 * PageState (Phase 4 remediation).
 *
 * The one shell for the loading / error-with-retry / empty / content
 * states a simple "load one thing on mount" page needs, paired with
 * useFetch. Several pages previously built their own partial version of
 * this - a plain `if (loading) return <PageLoader />` with no error
 * branch at all (Wallet, Loyalty), so a failed fetch left the spinner
 * spinning forever instead of ever reaching an error or empty state.
 *
 * Usage:
 *   const { data, loading, error, retry } = useFetch(...);
 *   return (
 *     <PageState loading={loading} error={error} onRetry={retry}
 *                isEmpty={!data?.length} emptyProps={{ title: "…" }}>
 *       {data && <ActualContent data={data} />}
 *     </PageState>
 *   );
 *
 * `isEmpty`/`emptyProps` are optional - omit both to skip the empty
 * branch entirely (e.g. a page whose "empty" is just a zero balance,
 * not a list with nothing in it).
 */
export default function PageState({
    loading,
    error,
    onRetry,
    errorProps,
    isEmpty = false,
    emptyProps,
    children
}) {
    if (loading) return <PageLoader />;

    if (error) {
        return <ErrorState onRetry={onRetry} {...errorProps} />;
    }

    if (isEmpty && emptyProps) {
        return <EmptyState {...emptyProps} />;
    }

    return children;
}
