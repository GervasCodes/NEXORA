import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import PageMeta from "../components/PageMeta";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import MaintenanceScreen from "../components/MaintenanceScreen";
import ListFilters from "../components/ui/ListFilters";
import StatusBadge from "../components/ui/StatusBadge";
import { SkeletonPage, SkeletonList } from "../components/Skeleton";
import PulseBar from "../components/ui/PulseBar";
import PullToRefresh from "../components/ui/PullToRefresh";
import InfiniteScrollFooter from "../components/ui/InfiniteScrollFooter";
import useInfiniteScroll from "../hooks/useInfiniteScroll";

const STATUS_OPTIONS = ["open", "under_review", "resolved", "rejected", "withdrawn"];
const FILTER_DEBOUNCE_MS = 350;

export default function Disputes() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [disputes, setDisputes] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [filters, setFilters] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    // Refetch with the list already on screen (pull-to-refresh): keeps the content and shows a PulseBar.
    const [refreshing, setRefreshing] = useState(false);
    const [maintenance, setMaintenance] = useState(null);
    // A failed next page: separate from the full-page error so the loaded
    // rows stay on screen and the footer offers a Retry.
    const [moreError, setMoreError] = useState(false);
    // Bumped per first-page fetch so a slow "next page" can't append onto a
    // list that has since been re-filtered or refreshed.
    const seq = useRef(0);

    const load = (page = 1, append = false, silent = false) => {
        const mySeq = append ? seq.current : ++seq.current;
        if (append) {
            setLoadingMore(true);
            setMoreError(false);
        } else {
            setLoadingMore(false);
            setMoreError(false);
            if (silent) setRefreshing(true); else setLoading(true);
        }
        setMaintenance(null);
        return api.get("/disputes", { params: { ...filters, page } })
            .then(({ data }) => {
                if (mySeq !== seq.current) return;
                setDisputes((prev) => (append ? [...prev, ...data.data.disputes] : data.data.disputes));
                setPagination(data.data.pagination);
            })
            .catch((err) => {
                if (mySeq !== seq.current) return;
                if (append) { setMoreError(true); return; }
                if (err.response?.data?.code === "MODULE_MAINTENANCE") {
                    setMaintenance(err.response.data.message);
                }
            })
            .finally(() => {
                if (mySeq !== seq.current) return;
                setLoading(false);
                setLoadingMore(false);
                setRefreshing(false);
            });
    };

    useEffect(() => {
        const timer = setTimeout(() => load(1, false), FILTER_DEBOUNCE_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    const hasMore = Boolean(pagination && pagination.page < pagination.totalPages);
    const loadMore = () => {
        if (loadingMore || !pagination) return;
        load(pagination.page + 1, true);
    };
    const { sentinelRef } = useInfiniteScroll({ hasMore, loading: loadingMore, error: moreError, onLoadMore: loadMore });

    const hasActiveFilters = Boolean(filters.status || filters.from || filters.to || filters.q);

    if (loading) return <SkeletonPage rows={4} />;
    if (maintenance) return <MaintenanceScreen title={t("dispute.list.maintenanceTitle")} message={maintenance} onRetry={() => load(1, false)} />;

    return (
        <PullToRefresh onRefresh={() => load(1, false, true)}>
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
                <div className="flex items-baseline justify-between mb-1">
                    <PageMeta title="My Disputes" noIndex />
                    <PulseBar active={refreshing} label={t("pulse.refreshing")} className="mb-3" />
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

                {disputes.length === 0 ? (
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
                        <ul className="space-y-3">
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
                            sentinelRef={sentinelRef}
                            hasMore={hasMore}
                            loading={loadingMore}
                            error={moreError}
                            onLoadMore={loadMore}
                            skeleton={<SkeletonList rows={2} />}
                            className="mt-4"
                        />
                    </>
                )}
            </div>
        </PullToRefresh>
    );
}
