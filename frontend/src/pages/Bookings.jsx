import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { SkeletonList } from "../components/Skeleton";
import BookingStatusBadge from "../components/BookingStatusBadge";
import MaintenanceScreen from "../components/MaintenanceScreen";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import ListFilters from "../components/ui/ListFilters";
import PageMeta from "../components/PageMeta";
import { BookingsIcon } from "../components/NavIcons";

const STATUS_OPTIONS = ["pending", "confirmed", "active", "completed", "cancelled", "refunded"];
const FILTER_DEBOUNCE_MS = 350;

export default function Bookings() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [bookings, setBookings] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [filters, setFilters] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [maintenance, setMaintenance] = useState(null);
    const [error, setError] = useState(false);

    const load = (page = 1, append = false) => {
        if (append) setLoadingMore(true); else setLoading(true);
        setMaintenance(null);
        setError(false);
        api.get("/bookings/mine", { params: { ...filters, page } })
            .then(({ data }) => {
                setBookings((prev) => (append ? [...prev, ...data.data.bookings] : data.data.bookings));
                setPagination(data.data.pagination);
            })
            .catch((err) => {
                if (err.response?.data?.code === "MODULE_MAINTENANCE") {
                    setMaintenance(err.response.data.message);
                } else {
                    setError(true);
                }
            })
            .finally(() => { setLoading(false); setLoadingMore(false); });
    };

    useEffect(() => {
        const timer = setTimeout(() => load(1, false), FILTER_DEBOUNCE_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    const hasActiveFilters = Boolean(filters.status || filters.from || filters.to || filters.q);

    if (maintenance) {
        return <MaintenanceScreen title="Bookings is under maintenance" message={maintenance} onRetry={() => load(1, false)} />;
    }

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
                <ErrorState title="Couldn't load your bookings" hint="Check your connection and try again." onRetry={() => load(1, false)} />
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">
            <PageMeta title="My Bookings" noIndex />
            <h1 className="font-display text-3xl mb-6">{t("booking.title")}</h1>

            <ListFilters
                statusOptions={STATUS_OPTIONS}
                filters={filters}
                onChange={setFilters}
                searchPlaceholder="Search service or store…"
            />

            {bookings.length === 0 ? (
                <EmptyState
                    title={hasActiveFilters ? "No bookings match those filters" : t("booking.empty")}
                    tone="teal"
                    icon={<BookingsIcon className="w-7 h-7" />}
                    action={
                        hasActiveFilters
                            ? <button onClick={() => setFilters({})} className="text-teal hover:underline text-sm">Clear filters</button>
                            : <Link to="/services" className="text-teal hover:underline text-sm">{t("booking.browseServices")}</Link>
                    }
                />
            ) : (
                <>
                    <ul className="divide-y divide-line border-y border-line">
                        {bookings.map((booking, i) => (
                            <li key={booking.id} className="animate-slide-up" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
                                <Link
                                    to={`/bookings/${booking.id}`}
                                    className="py-4 flex items-center justify-between gap-4 hover:bg-line/20 active:scale-[0.99] transition-all -mx-2 px-2 rounded-md"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{booking.service_title}</p>
                                        <p className="text-xs text-ash mt-0.5 price">{booking.booking_reference}</p>
                                        <p className="text-xs text-ash mt-0.5">
                                            {formatDate(booking.start_date)}
                                            {booking.end_date !== booking.start_date ? ` – ${formatDate(booking.end_date)}` : ""}
                                        </p>
                                    </div>
                                    <BookingStatusBadge status={booking.status} />
                                    <p className="price text-sm font-medium shrink-0">{format(booking.amount)}</p>
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
