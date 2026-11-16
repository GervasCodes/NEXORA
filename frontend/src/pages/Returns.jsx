import { useState } from "react";
import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import MaintenanceScreen from "../components/MaintenanceScreen";
import EmptyState from "../components/ui/EmptyState";
import ListFilters from "../components/ui/ListFilters";
import StatusBadge from "../components/ui/StatusBadge";
import ErrorState from "../components/ui/ErrorState";
import InfiniteScrollFooter from "../components/ui/InfiniteScrollFooter";
import { SkeletonList } from "../components/Skeleton";
import usePagedList from "../hooks/usePagedList";

const STATUS_OPTIONS = ["requested", "approved", "shipped_back", "received", "refunded", "rejected", "cancelled"];
const FILTER_DEBOUNCE_MS = 350;

const pickReturns = (body) => ({ items: body.data.returns, pagination: body.data.pagination });

export default function Returns() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [filters, setFilters] = useState({});
    const {
        items: returns, loading, loadingMore, error, maintenance, loadMoreError, hasLoaded, hasMore, loadMore, reload
    } = usePagedList({ url: "/returns", params: filters, pick: pickReturns, debounceMs: FILTER_DEBOUNCE_MS });

    const hasActiveFilters = Boolean(filters.status || filters.from || filters.to || filters.q);

    if (maintenance) return <MaintenanceScreen title={t("returns.title")} message={maintenance} onRetry={reload} />;

    // Full-page loader on the very first load only, so the filter bar (and a
    // search box being typed in) is not unmounted on every re-fetch.
    if (!hasLoaded) {
        return (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
                <div className="h-8 w-40 skeleton animate-shimmer rounded-md mb-8" />
                <SkeletonList rows={4} />
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title={t("returns.title")} noIndex />
            <h1 className="font-display text-2xl mb-6">{t("returns.title")}</h1>

            <ListFilters
                statusOptions={STATUS_OPTIONS}
                filters={filters}
                onChange={setFilters}
                searchPlaceholder="Search order number…"
            />

            {error ? (
                <ErrorState title="Couldn't load your returns" hint="Check your connection and try again." onRetry={reload} />
            ) : returns.length === 0 ? (
                <EmptyState
                    title={hasActiveFilters ? "No returns match those filters" : t("returns.empty")}
                    hint={hasActiveFilters ? undefined : "Returns you request will show up here."}
                    action={
                        hasActiveFilters
                            ? <button onClick={() => setFilters({})} className="text-teal hover:underline text-sm">Clear filters</button>
                            : <Link to="/orders" className="text-teal hover:underline text-sm">{t("dispute.list.goToOrders")}</Link>
                    }
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-ash">
                            <path d="M3 10h11a4 4 0 0 1 0 8h-3" />
                            <path d="m7 6-4 4 4 4" />
                        </svg>
                    }
                />
            ) : (
                <>
                    <ul aria-busy={loading} className={`space-y-3 transition-opacity ${loading ? "opacity-50" : ""}`}>
                        {returns.map((r) => (
                            <li key={r.id}>
                                <Link
                                    to={`/returns/${r.id}`}
                                    className="block border border-line rounded-lg p-4 hover:border-abyss transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                                        <p className="text-xs text-ash">{t("dispute.list.orderPrefix")} {r.order_number}</p>
                                        <StatusBadge domain="return" status={r.status} />
                                    </div>
                                    <p className="text-sm font-medium mb-1">{t(`return.reason.${r.reason}`)}</p>
                                    {r.refund_amount && (
                                        <p className="text-xs text-teal">{format(r.refund_amount)}</p>
                                    )}
                                    <p className="text-xs text-ash mt-1">{formatDate(r.created_at)}</p>
                                </Link>
                            </li>
                        ))}
                    </ul>

                    <InfiniteScrollFooter
                        hasMore={hasMore}
                        loading={loadingMore}
                        error={loadMoreError}
                        onLoadMore={loadMore}
                    />
                </>
            )}
        </div>
    );
}
