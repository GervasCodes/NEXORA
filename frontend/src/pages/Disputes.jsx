import { useState } from "react";
import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import MaintenanceScreen from "../components/MaintenanceScreen";
import ListFilters from "../components/ui/ListFilters";
import StatusBadge from "../components/ui/StatusBadge";
import ErrorState from "../components/ui/ErrorState";
import InfiniteScrollFooter from "../components/ui/InfiniteScrollFooter";
import { SkeletonList } from "../components/Skeleton";
import usePagedList from "../hooks/usePagedList";

const STATUS_OPTIONS = ["open", "under_review", "resolved", "rejected", "withdrawn"];
const FILTER_DEBOUNCE_MS = 350;

const pickDisputes = (body) => ({ items: body.data.disputes, pagination: body.data.pagination });

export default function Disputes() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [filters, setFilters] = useState({});
    const {
        items: disputes, loading, loadingMore, error, maintenance, loadMoreError, hasLoaded, hasMore, loadMore, reload
    } = usePagedList({ url: "/disputes", params: filters, pick: pickDisputes, debounceMs: FILTER_DEBOUNCE_MS });

    const hasActiveFilters = Boolean(filters.status || filters.from || filters.to || filters.q);

    if (maintenance) return <MaintenanceScreen title={t("dispute.list.maintenanceTitle")} message={maintenance} onRetry={reload} />;

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
            <div className="flex items-baseline justify-between mb-1">
                <PageMeta title="My Disputes" noIndex />
                <h1 className="font-display text-2xl">{t("dispute.list.title")}</h1>
            </div>
            <p className="text-ash text-sm mb-6">
                {t("dispute.list.intro")}
            </p>

            <ListFilters
                statusOptions={STATUS_OPTIONS}
                filters={filters}
                onChange={setFilters}
                searchPlaceholder="Search dispute number, subject, or order…"
            />

            {error ? (
                <ErrorState title="Couldn't load your disputes" hint="Check your connection and try again." onRetry={reload} />
            ) : disputes.length === 0 ? (
                <div className="border border-line rounded-lg p-8 text-center">
                    <p className="text-ash text-sm mb-3">
                        {hasActiveFilters ? "No disputes match those filters" : t("dispute.list.empty")}
                    </p>
                    {hasActiveFilters ? (
                        <button onClick={() => setFilters({})} className="text-teal hover:underline text-sm">Clear filters</button>
                    ) : (
                        <Link to="/orders" className="text-teal hover:underline text-sm">{t("dispute.list.goToOrders")}</Link>
                    )}
                </div>
            ) : (
                <>
                    <ul aria-busy={loading} className={`space-y-3 transition-opacity ${loading ? "opacity-50" : ""}`}>
                        {disputes.map((d) => (
                            <li key={d.id}>
                                <Link
                                    to={`/disputes/${d.id}`}
                                    className="block border border-line rounded-lg p-4 hover:border-abyss transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                                        <div>
                                            <p className="price text-sm font-medium">{d.dispute_number}</p>
                                            <p className="text-xs text-ash">{t("dispute.list.orderPrefix")} {d.order_number}</p>
                                        </div>
                                        <StatusBadge domain="dispute" status={d.status} />
                                    </div>
                                    <p className="text-sm font-medium mb-1">{d.subject}</p>
                                    <p className="text-xs text-ash mb-1">{t(`dispute.type.${d.type}`)}</p>
                                    {d.refund_amount && (
                                        <p className="text-xs text-teal">{t("dispute.list.refundApproved")}: {format(d.refund_amount)}</p>
                                    )}
                                    <p className="text-xs text-ash mt-1">{t("dispute.list.filed")} {formatDate(d.created_at)}</p>
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
