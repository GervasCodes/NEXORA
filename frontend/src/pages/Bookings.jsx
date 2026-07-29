import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { SkeletonList } from "../components/Skeleton";
import BookingStatusBadge from "../components/BookingStatusBadge";

export default function Bookings() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/bookings/mine").then(({ data }) => setBookings(data.data)).finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
                <div className="h-9 w-40 skeleton animate-shimmer rounded-md mb-8" />
                <SkeletonList rows={4} />
            </div>
        );
    }

    if (bookings.length === 0) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-24 text-center animate-slide-up">
                <p className="font-display text-2xl mb-2">{t("booking.empty")}</p>
                <Link to="/services" className="text-teal hover:underline text-sm">{t("booking.browseServices")}</Link>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">
            <h1 className="font-display text-3xl mb-8">{t("booking.title")}</h1>

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
        </div>
    );
}
