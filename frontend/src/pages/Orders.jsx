import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { SkeletonList } from "../components/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import ListFilters from "../components/ui/ListFilters";
import PageMeta from "../components/PageMeta";
import { OrdersIcon } from "../components/NavIcons";

const statusStyles = {
    pending: "bg-line text-ash",
    processing: "bg-mango/20 text-mango-dark",
    shipped: "bg-teal/10 text-teal",
    delivered: "bg-teal text-white",
    cancelled: "bg-coral/10 text-coral"
};

const STATUS_OPTIONS = ["pending", "processing", "shipped", "delivered", "cancelled"];

// Phase 4 (UI/UX remediation): filtering + pagination, matching the
// same pattern applied to Bookings.jsx/Returns.jsx/Disputes.jsx. Filter
// changes are debounced before hitting the API (the search box in
// particular would otherwise fire a request per keystroke).
const FILTER_DEBOUNCE_MS = 350;

export default function Orders() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [orders, setOrders] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [filters, setFilters] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(false);

    const load = (page = 1, append = false) => {
        if (append) setLoadingMore(true); else setLoading(true);
        setError(false);
        api.get("/orders", { params: { ...filters, page } })
            .then(({ data }) => {
                setOrders((prev) => (append ? [...prev, ...data.data.orders] : data.data.orders));
                setPagination(data.data.pagination);
            })
            .catch(() => setError(true))
            .finally(() => { setLoading(false); setLoadingMore(false); });
    };

    useEffect(() => {
        const timer = setTimeout(() => load(1, false), FILTER_DEBOUNCE_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    const hasActiveFilters = Boolean(filters.status || filters.from || filters.to || filters.q);

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
                <div className="h-9 w-40 skeleton animate-shimmer rounded-md mb-8" />
                <SkeletonList rows={4} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
                <ErrorState title="Couldn't load your orders" hint="Check your connection and try again." onRetry={() => load(1, false)} />
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">
            <PageMeta title="My Orders" noIndex />
            <h1 className="font-display text-3xl mb-6">{t("orders.title")}</h1>

            <ListFilters
                statusOptions={STATUS_OPTIONS}
                filters={filters}
                onChange={setFilters}
                searchPlaceholder="Search order number or product…"
            />

            {orders.length === 0 ? (
                <EmptyState
                    title={hasActiveFilters ? "No orders match those filters" : t("orders.empty")}
                    tone="mango"
                    icon={<OrdersIcon className="w-7 h-7" />}
                    action={
                        hasActiveFilters
                            ? <button onClick={() => setFilters({})} className="text-teal hover:underline text-sm">Clear filters</button>
                            : <Link to="/" className="text-teal hover:underline text-sm">{t("common.startShopping")}</Link>
                    }
                />
            ) : (
                <>
                    <ul className="divide-y divide-line border-y border-line">
                        {orders.map((order, i) => (
                            <li key={order.id} className="animate-slide-up" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
                                <Link to={`/orders/${order.id}`} className="py-4 flex items-center justify-between gap-4 hover:bg-line/20 active:scale-[0.99] transition-all -mx-2 px-2 rounded-md">
                                    <div>
                                        <p className="text-sm font-medium price">{order.order_number}</p>
                                        <p className="text-xs text-ash mt-0.5">{formatDate(order.created_at)}</p>
                                    </div>
                                    {order.is_parent ? (
                                        <span className="text-xs font-medium px-2.5 py-1 rounded-full capitalize bg-teal/10 text-teal">
                                            {t("orders.vendorsBadge", { count: order.vendor_count })}
                                        </span>
                                    ) : (
                                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize transition-colors ${statusStyles[order.status] || "bg-line text-ash"}`}>
                                            {order.status}
                                        </span>
                                    )}
                                    <p className="price text-sm font-medium">{format(order.total_amount)}</p>
                                </Link>
                            </li>
                        ))}
                    </ul>

                    {pagination && pagination.page < pagination.totalPages && (
                        <div className="text-center mt-6">
                            <button
                                onClick={() => load(pagination.page + 1, true)}
                                disabled={loadingMore}
                                className="text-sm text-teal hover:underline disabled:opacity-50"
                            >
                                {loadingMore ? "Loading…" : "Load more"}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
