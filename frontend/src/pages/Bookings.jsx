import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { SkeletonList } from "../components/Skeleton";
import BookingStatusBadge from "../components/BookingStatusBadge";
import MaintenanceScreen from "../components/MaintenanceScreen";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import ListFilters from "../components/ui/ListFilters";
import InfiniteScrollFooter from "../components/ui/InfiniteScrollFooter";
import usePagedList from "../hooks/usePagedList";
import PageMeta from "../components/PageMeta";
import { BookingsIcon } from "../components/NavIcons";

const STATUS_OPTIONS = ["pending", "confirmed", "active", "completed", "cancelled", "refunded"];
const FILTER_DEBOUNCE_MS = 350;

const pickBookings = (body) => ({ items: body.data.bookings, pagination: body.data.pagination });

export default function Bookings() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [filters, setFilters] = useState({});
    const {
        items: bookings, loading, loadingMore, error, maintenance, loadMoreError, hasLoaded, hasMore, loadMore, reload
    } = usePagedList({ url: "/bookings/mine", params: filters, pick: pickBookings, debounceMs: FILTER_DEBOUNCE_MS });

    const hasActiveFilters = Boolean(filters.status || filters.from || filters.to || filters.q);

    if (maintenance) {
        return <MaintenanceScreen title="Bookings is under maintenance" message={maintenance} onRetry={reload} />;
    }

    // Full-page skeleton on the very first load only, so the filter bar
    // (and a search box being typed in) is not unmounted on every re-fetch.
    if (!hasLoaded) {
        return (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
                <div className="h-9 w-40 skeleton animate-shimmer rounded-md mb-8" />
                <SkeletonList rows={4} />
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

            {error ? (
                <ErrorState title="Couldn't load your bookings" hint="Check your connection and try again." onRetry={reload} />
            ) : bookings.length === 0 ? (
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
                    <ul aria-busy={loading} className={`divide-y divide-line border-y border-line transition-opacity ${loading ? "opacity-50" : ""}`}>
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
