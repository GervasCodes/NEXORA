import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import { useLanguage } from "../../context/LanguageContext";
import BookingStatusBadge from "../../components/BookingStatusBadge";
import PageLoader from "../../components/PageLoader";
import Button from "../../components/ui/Button";

// Phase 5: a still-pending request is now declined via reject (below),
// not cancel - cancel stays for a confirmed booking either side needs
// to back out of. See booking.service.js#rejectBooking.
const CANCELLABLE = ["confirmed"];

export default function SellerBookings() {
    const { t } = useLanguage();
    const { profile } = useOutletContext();
    const isProvider = profile?.merchant_type === "service" || profile?.merchant_type === "hybrid";

    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState("");

    const load = () => {
        if (!isProvider) {
            setLoading(false);
            return;
        }
        setLoading(true);
        api.get("/bookings/provider/mine").then(({ data }) => setBookings(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, [isProvider]);

    const handleConfirm = async (booking) => {
        setBusyId(booking.id);
        setError("");
        try {
            await api.put(`/bookings/${booking.id}/confirm`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const handleReject = async (booking) => {
        setBusyId(booking.id);
        setError("");
        try {
            await api.put(`/bookings/${booking.id}/reject`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const handleCancel = async (booking) => {
        setBusyId(booking.id);
        setError("");
        try {
            await api.put(`/bookings/${booking.id}/cancel`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (!isProvider) {
        return (
            <div>
                <h1 className="font-display text-2xl mb-2">{t("booking.seller.title")}</h1>
                <p className="text-ash text-sm mb-4">{t("booking.seller.onlyProviders")}</p>
                <Link to="/seller/services" className="text-teal hover:underline text-sm">{t("booking.seller.goToServices")}</Link>
            </div>
        );
    }

    if (loading) return <PageLoader />;

    return (
        <div>
            <h1 className="font-display text-2xl mb-6">{t("booking.seller.title")}</h1>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            {bookings.length === 0 && <p className="text-ash text-sm">{t("booking.seller.empty")}</p>}

            <ul className="divide-y divide-line border-y border-line">
                {bookings.map((booking) => (
                    <li key={booking.id} className="py-4 flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{booking.service_title}</p>
                            <p className="price text-xs text-ash">{booking.booking_reference}</p>
                            <p className="text-xs text-ash">
                                {booking.customer_first_name} {booking.customer_last_name} ·{" "}
                                {formatDate(booking.start_date)}
                                {booking.end_date !== booking.start_date ? ` – ${formatDate(booking.end_date)}` : ""}
                            </p>
                        </div>

                        <BookingStatusBadge status={booking.status} size="sm" />

                        <p className="price text-sm">{formatMoney(booking.amount)}</p>

                        <div className="flex items-center gap-2 flex-wrap">
                            {booking.status === "pending" && (
                                <>
                                    <Button
                                        onClick={() => handleConfirm(booking)}
                                        disabled={busyId === booking.id}
                                        variant="secondary"
                                        size="sm"
                                    >
                                        {t("booking.seller.confirm")}
                                    </Button>
                                    <Button
                                        onClick={() => handleReject(booking)}
                                        disabled={busyId === booking.id}
                                        variant="secondary"
                                        size="sm"
                                        className="hover:border-coral hover:text-coral"
                                    >
                                        {t("booking.seller.reject")}
                                    </Button>
                                </>
                            )}
                            {CANCELLABLE.includes(booking.status) && (
                                <Button
                                    onClick={() => handleCancel(booking)}
                                    disabled={busyId === booking.id}
                                    variant="secondary"
                                    size="sm"
                                >
                                    {t("booking.seller.cancel")}
                                </Button>
                            )}
                            <Link to={`/bookings/${booking.id}`} className="text-xs text-teal hover:underline">
                                {t("booking.seller.details")}
                            </Link>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
