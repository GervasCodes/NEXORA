import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import AvailabilityCalendar from "../components/AvailabilityCalendar";
import RatingBreakdown from "../components/RatingBreakdown";
import { formatDate } from "../utils/format";

const PRICING_LABELS = {
    fixed: "",
    per_night: "/ night",
    per_hour: "/ hour",
    per_day: "/ day",
    per_person: "/ person"
};

// Inclusive calendar-date range, mirroring buildDateList's non-per_night
// branch server-side (booking.service.js) - used here only to price the
// selection client-side before submitting; the server always re-checks
// and re-prices for real when POST /bookings actually runs.
const inclusiveDateRange = (startDate, endDate) => {
    const dates = [];
    const cursor = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    while (cursor <= end) {
        dates.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
};

// Booking widget: lets a signed-in buyer pick date(s) on the calendar and
// create a booking. Kept as an inner component (rather than its own file)
// since it's tightly coupled to this page's `service` object and isn't
// reused anywhere else.
function BookingWidget({ service }) {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const { user } = useAuth();
    const navigate = useNavigate();

    const isPerNight = service.pricing_model === "per_night";

    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [priceByDate, setPriceByDate] = useState({});
    const [quantity, setQuantity] = useState(1);
    const [refreshToken, setRefreshToken] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const selectedDates = useMemo(() => {
        if (!startDate) return [];
        if (!endDate || startDate === endDate) return [startDate];
        return inclusiveDateRange(startDate, endDate);
    }, [startDate, endDate]);

    // per_night excludes the checkout day (a stay from the 1st to the 4th
    // is 3 nights), same convention booking.service.js#buildDateList uses.
    const nightsOrDays = isPerNight
        ? Math.max(selectedDates.length - 1, 0)
        : selectedDates.length;

    const estimatedTotal = useMemo(() => {
        const chargeableDates = isPerNight ? selectedDates.slice(0, -1) : selectedDates;
        return chargeableDates.reduce((sum, date) => sum + (priceByDate[date] || 0) * quantity, 0);
    }, [selectedDates, priceByDate, quantity, isPerNight]);

    const handleDateClick = (dateKey, info) => {
        setError("");
        setPriceByDate((prev) => ({ ...prev, [dateKey]: info.price }));

        if (isPerNight) {
            if (!startDate || (startDate && endDate) || dateKey <= startDate) {
                setStartDate(dateKey);
                setEndDate(null);
            } else {
                setEndDate(dateKey);
            }
        } else {
            setStartDate(dateKey);
            setEndDate(dateKey);
        }
    };

    // Fired once when a buyer drags across multiple days on the calendar
    // instead of tapping check-in then check-out separately. Only wired up
    // for per_night bookings - single-date pricing models keep using the
    // plain click handler above, since a "range" isn't a meaningful concept
    // for them.
    const handleRangeSelect = (rangeStart, rangeEnd, rangeInfo) => {
        setError("");
        setPriceByDate((prev) => ({ ...prev, ...rangeInfo }));
        setStartDate(rangeStart);
        setEndDate(rangeEnd);
    };

    const canSubmit = isPerNight ? startDate && endDate && startDate !== endDate : !!startDate;

    const handleBook = async () => {
        setSubmitting(true);
        setError("");
        try {
            const { data } = await api.post("/bookings", {
                service_id: service.id,
                start_date: startDate,
                end_date: endDate || startDate,
                quantity
            });
            navigate(`/bookings/${data.data.bookingId}`, { state: { justBooked: true } });
        } catch (err) {
            setError(extractErrorMessage(err));
            setRefreshToken((t) => t + 1);
            setStartDate(null);
            setEndDate(null);
        } finally {
            setSubmitting(false);
        }
    };

    if (!user) {
        return (
            <div className="mt-6 border border-line rounded-lg p-4">
                <p className="text-sm font-medium mb-2">{t("booking.widget.signInPrompt")}</p>
                <Link to="/login" className="text-teal hover:underline text-sm">{t("booking.widget.signIn")}</Link>
            </div>
        );
    }

    if (user.role !== "buyer") {
        return null;
    }

    return (
        <div className="mt-6">
            <p className="text-sm font-medium mb-2">
                {isPerNight ? t("booking.widget.selectDates") : t("booking.widget.selectDate")}
            </p>

            <AvailabilityCalendar
                serviceId={service.id}
                clickable
                selectedDates={selectedDates}
                onDateClick={handleDateClick}
                onRangeSelect={isPerNight ? handleRangeSelect : undefined}
                refreshToken={refreshToken}
            />

            {isPerNight && startDate && !endDate && (
                <p className="text-xs text-ash mt-2">{t("booking.widget.checkInSelected", { date: startDate })}</p>
            )}

            {service.pricing_model === "per_person" && (
                <div className="flex items-center gap-3 mt-3">
                    <label htmlFor="booking-quantity" className="text-sm text-ash">{t("booking.widget.guests")}</label>
                    <input
                        id="booking-quantity"
                        type="number"
                        min={1}
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                        className="w-20 border border-line rounded-md px-2 py-1.5 text-sm focus-ring bg-paper"
                    />
                </div>
            )}

            {canSubmit && (
                <div className="flex items-center justify-between mt-4 border-t border-line pt-4">
                    <div>
                        <p className="text-xs text-ash">
                            {isPerNight
                                ? t(nightsOrDays === 1 ? "booking.widget.nightsCount" : "booking.widget.nightsCountPlural", { count: nightsOrDays })
                                : t("booking.widget.oneDate")}
                            {quantity > 1 ? ` × ${quantity}` : ""}
                        </p>
                        <p className="price text-lg font-medium">{format(estimatedTotal)}</p>
                    </div>
                    <button
                        type="button"
                        onClick={handleBook}
                        disabled={submitting}
                        className="bg-mango text-abyss px-5 py-2.5 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60"
                    >
                        {submitting ? t("booking.widget.booking") : t("booking.widget.bookNow")}
                    </button>
                </div>
            )}

            {error && <p role="alert" className="text-coral text-sm mt-3">{error}</p>}

            <p className="text-xs text-ash mt-3">
                {t("booking.widget.paymentNote", { store: service.store_name })}
            </p>
        </div>
    );
}

export default function ServiceDetail() {
    const { format } = useCurrency();
    const { slug } = useParams();

    const [service, setService] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeMedia, setActiveMedia] = useState(0);
    const [reviews, setReviews] = useState(null);
    const [reviewSort, setReviewSort] = useState("newest");

    useEffect(() => {
        setLoading(true);
        api.get(`/services/${slug}`)
            .then(({ data }) => setService(data.data))
            .catch(() => setService(null))
            .finally(() => setLoading(false));
    }, [slug]);

    // Phase 4 (Customer Experience) - a service's reviews are read here,
    // but submitted from BookingDetail.jsx once a booking is completed
    // (a review is booking-keyed, not service-keyed - see migration
    // 065's design notes), so this page only ever displays them.
    useEffect(() => {
        if (!service) return;
        api.get(`/reviews/service/${service.id}`, { params: { sort: reviewSort } })
            .then(({ data }) => setReviews(data.data))
            .catch(() => {});
    }, [service, reviewSort]);

    if (loading) {
        return <div className="max-w-6xl mx-auto px-6 py-16 text-ash">Loading…</div>;
    }

    if (!service) {
        return (
            <div className="max-w-6xl mx-auto px-6 py-16 text-center">
                <p className="font-display text-2xl mb-2">Service not found</p>
                <Link to="/services" className="text-teal hover:underline text-sm">Back to services</Link>
            </div>
        );
    }

    const hasDiscount = service.discount_price && Number(service.discount_price) < Number(service.base_price);
    const priceSuffix = PRICING_LABELS[service.pricing_model] || "";
    const media = service.media?.length ? service.media : [{ media_url: null, media_type: "image" }];
    const current = media[activeMedia] || media[0];

    const locationLine = [service.city, service.region, service.country].filter(Boolean).join(", ");

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
            <div className="grid md:grid-cols-2 gap-10">
                <div>
                    <div className="aspect-square bg-line/40 rounded-lg overflow-hidden mb-3">
                        {current.media_url ? (
                            current.media_type === "video" ? (
                                <video src={current.media_url} controls className="w-full h-full object-cover" />
                            ) : (
                                <img src={current.media_url} alt={service.title} className="w-full h-full object-cover" />
                            )
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-ash text-sm">No photo</div>
                        )}
                    </div>

                    {media.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto">
                            {media.map((item, i) => (
                                <button
                                    key={item.id || i}
                                    type="button"
                                    onClick={() => setActiveMedia(i)}
                                    className={`w-16 h-16 shrink-0 rounded-md overflow-hidden border-2 transition-colors ${
                                        i === activeMedia ? "border-ink" : "border-transparent"
                                    }`}
                                >
                                    {item.media_type === "video" ? (
                                        <video src={item.media_url} className="w-full h-full object-cover" />
                                    ) : (
                                        <img src={item.media_url} alt="" className="w-full h-full object-cover" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    {service.category_name && (
                        <p className="text-xs text-ash uppercase tracking-wide mb-2">{service.category_name}</p>
                    )}

                    <h1 className="font-display text-2xl sm:text-3xl mb-2">{service.title}</h1>

                    <Link to={`/stores/${service.store_slug}`} className="text-sm text-teal hover:underline">
                        {service.store_name}
                        {service.is_verified ? " · Verified" : ""}
                    </Link>

                    {reviews?.average_rating && (
                        <p className="text-sm text-ash mt-2">
                            ★ {reviews.average_rating} average · {reviews.review_count} review{reviews.review_count === 1 ? "" : "s"}
                        </p>
                    )}

                    {locationLine && (
                        <p className="text-sm text-ash mt-2 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0">
                                <path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21Z" />
                                <circle cx="12" cy="10.5" r="2" />
                            </svg>
                            {locationLine}
                        </p>
                    )}

                    <div className="flex items-baseline gap-2 mt-4">
                        <span className="price text-2xl font-medium">
                            {format(hasDiscount ? service.discount_price : service.base_price)}
                        </span>
                        {priceSuffix && <span className="text-sm text-ash">{priceSuffix}</span>}
                        {hasDiscount && (
                            <span className="price text-sm text-ash line-through">{format(service.base_price)}</span>
                        )}
                    </div>

                    {service.description && (
                        <p className="text-sm text-ink/80 mt-4 whitespace-pre-line">{service.description}</p>
                    )}

                    <BookingWidget service={service} />
                </div>
            </div>

            <section className="mt-16 max-w-2xl">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                    <h2 className="font-display text-xl">Reviews</h2>
                    {reviews?.review_count > 0 && (
                        <select
                            value={reviewSort}
                            onChange={(e) => setReviewSort(e.target.value)}
                            className="text-xs border border-line rounded-md px-2 py-1.5 focus-ring"
                        >
                            <option value="newest">Newest</option>
                            <option value="highest">Highest rated</option>
                            <option value="lowest">Lowest rated</option>
                        </select>
                    )}
                </div>

                <RatingBreakdown breakdown={reviews?.rating_breakdown} reviewCount={reviews?.review_count} />

                {!reviews?.reviews?.length && <p className="text-ash text-sm">No reviews yet.</p>}
                <ul className="space-y-4">
                    {reviews?.reviews?.map((r) => (
                        <li key={r.id} className="border-b border-line pb-4">
                            <div className="flex justify-between items-baseline mb-1">
                                <p className="font-medium text-sm">{r.first_name} {r.last_name}</p>
                                <p className="text-xs text-ash">{formatDate(r.created_at)}</p>
                            </div>
                            <p className="text-sm text-ash mb-1">★ {r.rating}/5</p>
                            {r.comment && <p className="text-sm text-ink/80">{r.comment}</p>}
                            {r.photos?.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {r.photos.map((photo) => (
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
                            {r.seller_reply && (
                                <div className="mt-2 bg-line/30 rounded-md px-3 py-2">
                                    <p className="text-xs font-medium text-ink mb-0.5">Provider response</p>
                                    <p className="text-xs text-ink/80">{r.seller_reply}</p>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
