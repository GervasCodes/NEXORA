import { useEffect, useState } from "react";
import { useParams, useLocation, Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useSocket } from "../context/SocketContext";
import BookingStatusBadge from "../components/BookingStatusBadge";
import BookingProgressTimeline from "../components/BookingProgressTimeline";
import PageLoader from "../components/PageLoader";

// Mirrors booking.service.js's CANCELLABLE_STATUSES - the backend
// allows either side to cancel a pending or confirmed booking. A
// still-pending request also has a provider-only reject action (see
// booking.service.js#rejectBooking), so a provider viewing a pending
// booking gets Confirm/Reject, not a redundant Cancel button.
const CANCELLABLE = ["pending", "confirmed"];

// Accessible by either side of the booking - booking.service.js's
// getBookingById checks that the signed-in user is the customer or the
// provider, not a role check at the route level, so this page renders the
// same for both and just varies which actions it offers.
export default function BookingDetail() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const { user } = useAuth();
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    const justBooked = !!location.state?.justBooked;

    const [booking, setBooking] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [phone, setPhone] = useState("");

    // Phase 4 (Customer Experience) - "Improved customer booking journey":
    // a completed booking now carries can_review/review from the API
    // (see booking.service.js#getBookingById), so this form only needs
    // to show up when there's actually something to review, without a
    // second request to figure that out. Mirrors ProductDetail.jsx's
    // review submission flow, just posting to /reviews/booking/:id
    // instead of /reviews.
    const MAX_REVIEW_PHOTOS = 5;
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [reviewRating, setReviewRating] = useState(5);
    const [reviewComment, setReviewComment] = useState("");
    const [submittingReview, setSubmittingReview] = useState(false);
    const [reviewError, setReviewError] = useState("");
    const [justSubmittedReview, setJustSubmittedReview] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    const load = () => {
        api.get(`/bookings/${id}`)
            .then(({ data }) => setBooking(data.data))
            .catch((err) => setError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(load, [id]);

    // Handles the buyer landing back on this page after a Snippe checkout
    // or PayPal approval - mirrors OrderDetail.jsx's own ?payment= handling
    // exactly (Phase 3), just keyed to a booking instead of an order.
    const pollForPaymentConfirmation = (attempt = 0) => {
        api.get(`/bookings/${id}`).then(({ data }) => {
            const fresh = data.data;
            if (fresh.payment_status === "paid") {
                setBooking(fresh);
                setMessage(t("booking.payment.success"));
                return;
            }
            if (attempt < 6) {
                setTimeout(() => pollForPaymentConfirmation(attempt + 1), 3000);
            } else {
                setMessage(t("booking.payment.stillConfirming"));
            }
        }).catch(() => {});
    };

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const payment = params.get("payment");
        if (!payment) return;

        const cleanUrl = () => navigate(`/bookings/${id}`, { replace: true, state: location.state });

        if (payment === "paypal_return") {
            const paypalOrderId = params.get("token");
            if (!paypalOrderId) {
                cleanUrl();
                return;
            }
            api.post("/payments/paypal/capture", { paypalOrderId })
                .then(({ data }) => {
                    if (data.data?.success) {
                        setMessage(t("booking.payment.success"));
                    } else {
                        setError(t("booking.payment.notCompleted"));
                    }
                })
                .catch((err) => setError(extractErrorMessage(err)))
                .finally(() => {
                    load();
                    cleanUrl();
                });

        } else if (payment === "success") {
            setMessage(t("booking.payment.confirming"));
            load();
            pollForPaymentConfirmation();
            cleanUrl();

        } else if (payment === "cancelled") {
            setError(t("booking.payment.cancelledNotice"));
            cleanUrl();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);

    const { socket, connected } = useSocket();

    // Live confirmation once the provider's webhook actually lands -
    // covers mobile money (buyer stays on this page entering their PIN)
    // and is the fastest path for the Snippe/PayPal redirect flows above.
    useEffect(() => {
        if (!socket || !connected) return;

        const handlePaymentUpdated = (payload) => {
            if (Number(payload.bookingId) !== Number(id)) return;
            load();
            setMessage(payload.success ? t("booking.payment.success") : "");
            setError(payload.success ? "" : t("booking.payment.notCompleted"));
        };

        socket.on("payment:updated", handlePaymentUpdated);
        return () => socket.off("payment:updated", handlePaymentUpdated);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, connected, id]);

    if (loading) return <PageLoader />;

    if (!booking) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">{t("booking.notFound")}</p>
                <p className="text-ash text-sm mb-4">{error}</p>
                <Link to="/bookings" className="text-teal hover:underline text-sm">{t("booking.backToBookings")}</Link>
            </div>
        );
    }

    const isProvider = user?.id === booking.provider_id;
    const canPay = !isProvider && booking.payment_status === "unpaid"
        && !["cancelled", "refunded", "rejected"].includes(booking.status);
    const canCancel = CANCELLABLE.includes(booking.status) && !(isProvider && booking.status === "pending");

    const handleConfirm = async () => {
        setBusy(true);
        setError("");
        try {
            await api.put(`/bookings/${id}/confirm`);
            setMessage(t("booking.confirmedMessage"));
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const handleCancel = async () => {
        setBusy(true);
        setError("");
        try {
            const { data } = await api.put(`/bookings/${id}/cancel`);
            setMessage(data.data?.refunded ? t("booking.cancelledRefundedMessage") : t("booking.cancelledMessage"));
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    // Phase 5: provider-only decline of a still-pending request - see
    // booking.service.js#rejectBooking. Kept separate from handleCancel
    // so the two actions can't drift (e.g. one gaining a confirmation
    // step the other doesn't).
    const handleReject = async () => {
        setBusy(true);
        setError("");
        try {
            await api.put(`/bookings/${id}/reject`);
            setMessage(t("booking.rejectedMessage"));
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    // Sending the USSD prompt only means the buyer can now enter their
    // PIN - it's not confirmation the payment went through. The actual
    // result arrives via the "payment:updated" socket listener above.
    const handlePayMobileMoney = async () => {
        if (!phone.trim()) {
            setError(t("booking.payment.phoneRequired"));
            return;
        }
        setBusy(true);
        setError("");
        try {
            const { data } = await api.post(`/payments/booking/${id}/initiate`, { phone: phone.trim() });
            setMessage(data.message || t("booking.payment.checkPhone"));
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const handlePaySnippe = async () => {
        setBusy(true);
        setError("");
        try {
            const origin = window.location.origin;
            const { data } = await api.post(`/payments/booking/${id}/snippe/checkout`, {
                successUrl: `${origin}/bookings/${id}?payment=success`,
                cancelUrl: `${origin}/bookings/${id}?payment=cancelled`
            });
            window.location.href = data.data.url;
        } catch (err) {
            setError(extractErrorMessage(err));
            setBusy(false);
        }
    };

    // MalipoPay Card equivalent of handlePaySnippe above.
    const handlePayMalipopayCard = async () => {
        setBusy(true);
        setError("");
        try {
            const origin = window.location.origin;
            const { data } = await api.post(`/payments/booking/${id}/malipopay-card/checkout`, {
                successUrl: `${origin}/bookings/${id}?payment=success`,
                cancelUrl: `${origin}/bookings/${id}?payment=cancelled`
            });
            window.location.href = data.data.url;
        } catch (err) {
            setError(extractErrorMessage(err));
            setBusy(false);
        }
    };

    const handlePayPaypal = async () => {
        setBusy(true);
        setError("");
        try {
            const origin = window.location.origin;
            const { data } = await api.post(`/payments/booking/${id}/paypal/create`, {
                returnUrl: `${origin}/bookings/${id}?payment=paypal_return`,
                cancelUrl: `${origin}/bookings/${id}?payment=cancelled`
            });
            window.location.href = data.data.url;
        } catch (err) {
            setError(extractErrorMessage(err));
            setBusy(false);
        }
    };

    const handleReviewSubmit = async (e) => {
        e.preventDefault();
        setSubmittingReview(true);
        setReviewError("");
        try {
            await api.post(`/reviews/booking/${id}`, {
                rating: reviewRating,
                comment: reviewComment
            });
            setJustSubmittedReview(true);
            setReviewComment("");
            load();
        } catch (err) {
            setReviewError(extractErrorMessage(err));
        } finally {
            setSubmittingReview(false);
        }
    };

    const handleReviewPhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !booking?.review?.id) return;

        setUploadingPhoto(true);
        setReviewError("");
        try {
            const body = new FormData();
            body.append("photo", file);
            await api.post(`/reviews/${booking.review.id}/photos`, body);
            load();
        } catch (err) {
            setReviewError(extractErrorMessage(err));
        } finally {
            setUploadingPhoto(false);
            e.target.value = "";
        }
    };

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            {justBooked && booking.status === "pending" && (
                <div className="flex items-start gap-3 bg-teal/10 text-ink rounded-lg px-4 py-3.5 mb-6 animate-slide-down">
                    <div className="w-8 h-8 rounded-full bg-teal text-frost flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                            <path d="M20 6 9 17l-5-5" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-sm font-medium">{t("booking.justBookedTitle")}</p>
                        <p className="text-xs text-ash mt-0.5">{t("booking.justBookedBody", { store: booking.store_name || "" })}</p>
                    </div>
                </div>
            )}

            <p className="text-xs uppercase tracking-widest text-ash mb-1">{t("booking.reference")}</p>
            <h1 className="price font-display text-2xl mb-1">{booking.booking_reference}</h1>
            <p className="text-sm text-ash mb-6">{t("booking.created", { date: formatDate(booking.created_at) })}</p>

            {message && <p className="text-sm text-teal mb-4">{message}</p>}
            {error && <p role="alert" className="text-sm text-coral mb-4">{error}</p>}

            <BookingProgressTimeline status={booking.status} />

            <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
                <div>
                    <p className="text-ash mb-0.5">{t("booking.statusLabel")}</p>
                    <BookingStatusBadge status={booking.status} />
                </div>
                <div>
                    <p className="text-ash mb-0.5">{t("booking.payment")}</p>
                    <p className="capitalize font-medium">{booking.payment_status === "paid" ? t("booking.paid") : t("booking.unpaid")}</p>
                </div>
                <div>
                    <p className="text-ash mb-0.5">{booking.end_date !== booking.start_date ? t("booking.checkIn") : t("booking.date")}</p>
                    <p className="font-medium">{formatDate(booking.start_date)}</p>
                </div>
                {booking.end_date !== booking.start_date && (
                    <div>
                        <p className="text-ash mb-0.5">{t("booking.checkOut")}</p>
                        <p className="font-medium">{formatDate(booking.end_date)}</p>
                    </div>
                )}
                <div>
                    <p className="text-ash mb-0.5">{t("booking.quantity")}</p>
                    <p className="font-medium">{booking.quantity}</p>
                </div>
            </div>

            {booking.items?.length > 0 && (
                <ul className="divide-y divide-line border-y border-line mb-6">
                    {booking.items.map((item) => (
                        <li key={item.service_date} className="py-3 flex justify-between text-sm">
                            <span>{formatDate(item.service_date)} × {item.quantity}</span>
                            <span className="price">{format(item.subtotal)}</span>
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex justify-between items-baseline mb-8">
                <span className="text-sm text-ash">{t("booking.total")}</span>
                <span className="price text-xl font-medium">{format(booking.amount)}</span>
            </div>

            {canPay && (
                <div className="border border-line rounded-lg p-4 mb-6">
                    <p className="text-sm font-medium mb-1">{t("booking.payment.title")}</p>
                    <p className="text-xs text-ash mb-3">{t("booking.payment.escrowNote")}</p>

                    <div className="flex flex-col gap-2 mb-3">
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder={t("booking.payment.phonePlaceholder")}
                            className="border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                        />
                        <button onClick={handlePayMobileMoney} disabled={busy}
                            className="bg-mango text-abyss px-5 py-2.5 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60">
                            {busy ? t("booking.payment.processing") : t("booking.payment.payMobileMoney")}
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button onClick={handlePaySnippe} disabled={busy}
                            className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-abyss transition-colors focus-ring disabled:opacity-60">
                            {busy ? t("booking.payment.redirecting") : t("booking.payment.payCard")}
                        </button>
                        <button onClick={handlePayMalipopayCard} disabled={busy}
                            className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-abyss transition-colors focus-ring disabled:opacity-60">
                            {busy ? t("booking.payment.redirecting") : t("booking.payment.payCardMalipopay")}
                        </button>
                        <button onClick={handlePayPaypal} disabled={busy}
                            className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-abyss transition-colors focus-ring disabled:opacity-60">
                            {busy ? t("booking.payment.redirecting") : t("booking.payment.payPaypal")}
                        </button>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap gap-3">
                {isProvider && booking.status === "pending" && (
                    <>
                        <button onClick={handleConfirm} disabled={busy}
                            className="bg-teal text-white px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity focus-ring disabled:opacity-60">
                            {busy ? t("booking.confirming") : t("booking.confirmButton")}
                        </button>
                        <button onClick={handleReject} disabled={busy}
                            className="border border-coral text-coral px-5 py-2.5 rounded-md text-sm font-medium hover:bg-coral/5 transition-colors focus-ring disabled:opacity-60">
                            {busy ? t("booking.rejecting") : t("booking.rejectButton")}
                        </button>
                    </>
                )}
                {canCancel && (
                    <button onClick={handleCancel} disabled={busy}
                        className="border border-coral text-coral px-5 py-2.5 rounded-md text-sm font-medium hover:bg-coral/5 transition-colors focus-ring disabled:opacity-60">
                        {busy ? t("booking.cancelling") : t("booking.cancelButton")}
                    </button>
                )}
            </div>

            {!isProvider && (booking.can_review || booking.review) && (
                <div className="mt-8 border-t border-line pt-6">
                    <h2 className="font-display text-lg mb-3">{t("booking.review.title")}</h2>

                    {booking.review ? (
                        <div className="border border-line rounded-lg p-4">
                            {justSubmittedReview && (
                                <p className="text-sm text-teal mb-3">{t("booking.review.thanks")}</p>
                            )}
                            <p className="text-sm text-ash mb-1">{t("booking.review.yourReview")}</p>
                            <p className="text-sm mb-1">★ {booking.review.rating}/5</p>
                            {booking.review.comment && (
                                <p className="text-sm text-ink/80">{booking.review.comment}</p>
                            )}

                            {justSubmittedReview && (
                                (booking.review.photos?.length || 0) < MAX_REVIEW_PHOTOS ? (
                                    <label className="inline-block text-sm border border-line px-4 py-2 rounded-md cursor-pointer hover:border-ink transition-colors mt-3">
                                        {uploadingPhoto ? t("booking.review.uploading") : t("booking.review.addPhoto")}
                                        <input type="file" accept="image/*" onChange={handleReviewPhotoUpload} disabled={uploadingPhoto} className="hidden" />
                                    </label>
                                ) : (
                                    <p className="text-ash text-xs mt-3">{t("booking.review.maxPhotos", { count: MAX_REVIEW_PHOTOS })}</p>
                                )
                            )}

                            {booking.review.photos?.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {booking.review.photos.map((photo) => (
                                        <img
                                            key={photo.id}
                                            src={photo.photo_url}
                                            alt=""
                                            loading="lazy"
                                            className="w-16 h-16 rounded-md object-cover border border-line"
                                        />
                                    ))}
                                </div>
                            )}

                            {reviewError && <p className="text-sm text-coral mt-3">{reviewError}</p>}
                        </div>
                    ) : showReviewForm ? (
                        <form onSubmit={handleReviewSubmit} className="border border-line rounded-lg p-4">
                            <p className="text-sm mb-3">{t("booking.review.prompt")}</p>
                            <label className="block text-sm mb-1">{t("booking.review.rating")}</label>
                            <select
                                value={reviewRating}
                                onChange={(e) => setReviewRating(Number(e.target.value))}
                                className="border border-line rounded-md px-3 py-2 text-sm mb-3 focus-ring bg-paper"
                            >
                                {[5, 4, 3, 2, 1].map((n) => (
                                    <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>
                                ))}
                            </select>
                            <label className="block text-sm mb-1">{t("booking.review.comment")}</label>
                            <textarea
                                value={reviewComment}
                                onChange={(e) => setReviewComment(e.target.value)}
                                maxLength={1000}
                                rows={3}
                                className="w-full border border-line rounded-md px-3 py-2 text-sm mb-3 focus-ring"
                            />
                            {reviewError && <p className="text-sm text-coral mb-3">{reviewError}</p>}
                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    disabled={submittingReview}
                                    className="bg-mango text-abyss px-5 py-2 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-50"
                                >
                                    {submittingReview ? t("booking.review.submitting") : t("booking.review.submit")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowReviewForm(false)}
                                    className="text-sm text-ash hover:underline"
                                >
                                    {t("booking.cancelButton")}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <button
                            onClick={() => setShowReviewForm(true)}
                            className="text-sm text-teal hover:underline"
                        >
                            {t("booking.review.title")}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
