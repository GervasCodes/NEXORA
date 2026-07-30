const bookingRepository = require("./booking.repository");
const availabilityRepository = require("../availability/availability.repository");
const serviceRepository = require("../service/service.repository");
const notificationService = require("../notification/notification.service");
const walletService = require("../wallet/wallet.service");
const paymentService = require("../payment/payment.service");
const reviewRepository = require("../review/review.repository");
const { computeDynamicPrice } = require("../../utils/dynamicPricing");

const generateBookingReference = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `BKG-${timestamp}-${random}`;
};

// Which calendar dates a booking actually occupies depends on its
// pricing_model, not just [startDate, endDate] taken literally:
//  - per_night: hotel-style. Checkout day isn't a night stayed, so a
//    2026-08-01 -> 2026-08-04 booking is 3 nights (01, 02, 03), not 4 -
//    same convention every hotel booking system uses.
//  - per_day / per_hour / per_person / fixed: possession-style (a car
//    rental, a tour seat, a meeting room booking). Every day from
//    startDate to endDate is charged, checkout day included - a 5-day
//    car rental returned on day 5 still had the car for day 5.
// For all non-per_night models, startDate === endDate is also valid
// (and the common case for per_hour/per_person/fixed - a single day's
// tour or a one-off booking), producing exactly one date.
const buildDateList = (pricingModel, startDate, endDate) => {
    const dates = [];
    const cursor = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);

    if (pricingModel === "per_night") {
        while (cursor < end) {
            dates.push(cursor.toISOString().slice(0, 10));
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
    } else {
        while (cursor <= end) {
            dates.push(cursor.toISOString().slice(0, 10));
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
    }

    return dates;
};

exports.buildDateList = buildDateList;

// Checks every date in the booking against service_availability and
// returns the priced line items - the read-side twin of
// booking.repository.js#createBooking's decrement loop. Run once before
// the transaction (to fail fast with a clear message before opening a
// connection) - createBooking still re-checks with a guarded UPDATE
// inside the transaction, since availability can change between this
// call and the insert.
const priceDateItems = async (service, dates, quantity) => {
    const rows = await availabilityRepository.findByServiceAndDateRange(
        service.id, dates[0], dates[dates.length - 1]
    );

    const byDate = new Map(rows.map((row) => [
        row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date,
        row
    ]));

    // Phase 5 (Growth) - Dynamic Pricing. Fetched once outside the loop
    // (same rule set applies to every date in the range) and only
    // consulted for a date with no manual service_availability.price -
    // a provider's explicit per-date override always wins over a rule,
    // same priority order utils/dynamicPricing.js documents.
    const pricingRules = await serviceRepository.findActivePricingRulesByService(service.id);
    const basePrice = Number(service.discount_price ?? service.base_price);

    const items = [];

    for (const date of dates) {
        const row = byDate.get(date);

        if (!row || row.status !== "open") {
            throw new Error(`This service isn't open for booking on ${date}`);
        }

        if (row.available_units < quantity) {
            throw new Error(`Only ${row.available_units} unit(s) left on ${date}`);
        }

        const unitPrice = row.price !== null
            ? Number(row.price)
            : computeDynamicPrice(basePrice, pricingRules, date);

        items.push({ date, quantity, unitPrice, subtotal: unitPrice * quantity });
    }

    return items;
};

exports.createBooking = async (customerId, { service_id, start_date, end_date, quantity }) => {
    const service = await serviceRepository.findById(service_id);

    if (!service || service.status !== "published" || !service.is_active) {
        throw new Error("Service not found");
    }

    if (service.provider_id === customerId) {
        throw new Error("You can't book your own service");
    }

    const qty = Number(quantity) || 1;

    if (service.pricing_model !== "per_night" && start_date !== end_date) {
        throw new Error("This service is booked for a single date");
    }

    if (new Date(start_date) > new Date(end_date)) {
        throw new Error("Start date must be on or before the end date");
    }

    const dates = buildDateList(service.pricing_model, start_date, end_date);

    if (dates.length === 0) {
        throw new Error("A per-night booking needs at least one night");
    }

    const dateItems = await priceDateItems(service, dates, qty);
    const amount = dateItems.reduce((sum, item) => sum + item.subtotal, 0);

    const bookingId = await bookingRepository.createBooking({
        bookingReference: generateBookingReference(),
        serviceId: service.id,
        providerId: service.provider_id,
        customerId,
        startDate: start_date,
        endDate: end_date,
        quantity: qty,
        amount,
        dateItems
    });

    // Booking Created notification (CHANGES.md's Notifications list) -
    // plain title/message rather than i18n keys, same "fallback" path
    // notify() documents for call sites not yet migrated to keys.
    await notificationService.notify({
        userId: service.provider_id,
        type: "booking_created",
        title: "New booking received",
        message: `You have a new booking for "${service.title}".`,
        url: `/seller/bookings/${bookingId}`
    });

    return { bookingId, amount };
};

const loadBookingWithAccessCheck = async (bookingId, userId) => {
    const booking = await bookingRepository.findById(bookingId);

    if (!booking || (booking.customer_id !== userId && booking.provider_id !== userId)) {
        throw new Error("Booking not found");
    }

    return booking;
};

// Phase 4 (Customer Experience) - "Improved customer booking journey":
// a completed booking now carries its own review (if the customer
// already left one) plus a can_review flag, so BookingDetail.jsx can
// show "Leave a review" / "Edit your review" / nothing, without a
// second round trip to the reviews endpoints just to find out which.
// Only computed for the customer's own view - a provider doesn't need
// this flag on their own copy of the booking.
exports.getBookingById = async (bookingId, userId) => {
    const booking = await loadBookingWithAccessCheck(bookingId, userId);
    const items = await bookingRepository.findItemsByBookingId(bookingId);

    let review = null;
    if (booking.status === "completed" && booking.customer_id === userId) {
        const reviewRow = await reviewRepository.findByBuyerAndBooking(userId, bookingId);
        if (reviewRow) {
            const photos = await reviewRepository.findPhotosByReviewIds([reviewRow.id]);
            review = {
                ...reviewRow,
                photos: photos.map((photo) => ({ id: photo.id, photo_url: photo.photo_url }))
            };
        }
    }

    return {
        ...booking,
        items,
        review,
        can_review: booking.status === "completed" && booking.customer_id === userId && !review
    };
};

exports.getMyBookingsAsCustomer = async (customerId) => {
    return bookingRepository.findByCustomer(customerId);
};

exports.getMyBookingsAsProvider = async (providerId) => {
    return bookingRepository.findByProvider(providerId);
};

// Provider-only: pending -> confirmed. CHANGES.md's Booking Lifecycle
// (pending -> confirmed -> active -> completed) is a straight line with
// cancelled/refunded as the only exits, so this doesn't need a generic
// "set any status" endpoint - each transition gets its own guarded
// function, same reasoning service.service.js's publish/unpublish split
// already follows.
exports.confirmBooking = async (bookingId, providerId) => {
    const booking = await bookingRepository.findById(bookingId);

    if (!booking || booking.provider_id !== providerId) {
        throw new Error("Booking not found");
    }

    if (booking.status !== "pending") {
        throw new Error(`Booking is already "${booking.status}"`);
    }

    await bookingRepository.setStatus(bookingId, "confirmed");

    await notificationService.notify({
        userId: booking.customer_id,
        type: "booking_confirmed",
        title: "Booking confirmed",
        message: `Your booking ${booking.booking_reference} has been confirmed.`,
        url: `/bookings/${bookingId}`
    });
};

// Either side can cancel a pending/confirmed booking - a provider
// declining a request, or a customer changing their mind. Once a
// booking is active/completed it's too late to cancel outright (that's
// what refunds are for for a payment already taken - Phase 3).
const CANCELLABLE_STATUSES = ["pending", "confirmed"];

// Phase 3: a cancelled booking that was never paid just needs its
// availability restored (the original behavior, unchanged below). One
// that WAS paid also needs its escrow reversed and the buyer refunded -
// CHANGES.md's Booking Lifecycle lists REFUNDED as its own exit state
// distinct from CANCELLED specifically for this case. There's no dispute
// row to hang this off of (see migration 064's design notes), so it's
// handled directly here rather than through the disputes/refunds tables
// an order-side cancellation-with-refund would eventually go through.
exports.cancelBooking = async (bookingId, userId) => {
    const booking = await loadBookingWithAccessCheck(bookingId, userId);

    if (!CANCELLABLE_STATUSES.includes(booking.status)) {
        throw new Error(`Booking can no longer be cancelled (status: "${booking.status}")`);
    }

    const wasPaid = booking.payment_status === "paid";
    const items = await bookingRepository.findItemsByBookingId(bookingId);

    await bookingRepository.cancelBooking(
        bookingId, booking.service_id, items, wasPaid ? "refunded" : "cancelled"
    );

    if (wasPaid) {
        // Reverse the provider's escrowed/released earnings for this
        // booking first (so the ledger reflects the reversal even if the
        // gateway call below fails or needs manual follow-up), then
        // attempt to actually push the money back to the buyer.
        walletService.reverseProviderEarningsForBooking(
            booking.provider_id, Number(booking.amount), bookingId
        ).catch((err) => console.error("booking wallet reversal error:", err));

        paymentService.refundBookingPayment(bookingId, Number(booking.amount))
            .then((result) => {
                if (!result.success) {
                    console.error(`booking #${bookingId} refund needs manual handling:`, result.error);
                }
            })
            .catch((err) => console.error("booking refund error:", err));
    }

    const notifyUserId = userId === booking.customer_id ? booking.provider_id : booking.customer_id;

    await notificationService.notify({
        userId: notifyUserId,
        type: "booking_cancelled",
        title: wasPaid ? "Booking refunded" : "Booking cancelled",
        message: wasPaid
            ? `Booking ${booking.booking_reference} was cancelled and refunded.`
            : `Booking ${booking.booking_reference} has been cancelled.`,
        url: `/bookings/${bookingId}`
    });
};
