const bookingRepository = require("./booking.repository");
const availabilityRepository = require("../availability/availability.repository");
const serviceRepository = require("../service/service.repository");
const notificationService = require("../notification/notification.service");
const walletService = require("../wallet/wallet.service");
const logger = require("../../utils/logger").child({ module: "booking" });
const Sentry = require("../../config/sentry");
const refundService = require("../refund/refund.service");
const adminNotificationService = require("../adminNotification/adminNotification.service");
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

    // (Growth) - Dynamic Pricing. Fetched once outside the loop
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

// (Customer Experience) - "Improved customer booking journey":
// a completed booking now carries its own review (if the customer
// already left one) plus a can_review flag, so BookingDetail.jsx can
// show "Leave a review" / "Edit your review" / nothing, without a
// second round trip to the reviews endpoints just to find out which.
// Only computed for the customer's own view - a provider doesn't need
// this flag on their own copy of the booking.
exports.getBookingById = async (bookingId, userId) => {
    const booking = await loadBookingWithAccessCheck(bookingId, userId);
    const items = await bookingRepository.findItemsByBookingId(bookingId);

    // (UI/UX remediation) - the reschedule UI needs to know the
    // service's pricing_model to pick the right date-selection mode
    // (single date vs. check-in/check-out range), the same distinction
    // ServiceDetail.jsx's own booking widget already makes. Also fills a
    // gap that predates this phase: this response previously carried no
    // service title/slug at all, so BookingDetail.jsx had no way to
    // display which service a booking was even for.
    const service = await serviceRepository.findById(booking.service_id);

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
        service_title: service?.title || null,
        service_slug: service?.slug || null,
        pricing_model: service?.pricing_model || null,
        items,
        review,
        can_review: booking.status === "completed" && booking.customer_id === userId && !review
    };
};

exports.getMyBookingsAsCustomer = async (customerId, query = {}) => {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 10));

    const { bookings, total } = await bookingRepository.findByCustomer(customerId, {
        status: query.status || null,
        from: query.from || null,
        to: query.to || null,
        q: query.q || null,
        page,
        limit
    });

    return {
        bookings,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit))
        }
    };
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
        titleKey: "notifications.booking.confirmed.title",
        messageKey: "notifications.booking.confirmed.message",
        messageParams: { reference: booking.booking_reference },
        url: `/bookings/${bookingId}`,
        withEmail: true
    });
};

// (Merchant-Type-Aware Dashboard - Booking Status Review):
// provider-only, pending -> rejected. Split out from cancelBooking
// below so a provider turning down a request is distinguishable from
// either side cancelling one - see migration 070's notes. Only valid
// while still pending; once a provider has confirmed a booking, backing
// out goes through the existing cancel flow instead (same as any other
// post-confirmation cancellation).
exports.rejectBooking = async (bookingId, providerId) => {
    const booking = await bookingRepository.findById(bookingId);

    if (!booking || booking.provider_id !== providerId) {
        throw new Error("Booking not found");
    }

    if (booking.status !== "pending") {
        throw new Error(`Booking can no longer be rejected (status: "${booking.status}")`);
    }

    const wasPaid = booking.payment_status === "paid";
    const items = await bookingRepository.findItemsByBookingId(bookingId);

    // Payment flow unchanged: a pending booking that was already paid
    // still exits through 'refunded', exactly like cancelBooking - only
    // the unpaid case gets the new, more specific 'rejected' status.
    // Conditional update + changed check, same reasoning as
    // cancelBooking above. No cancellation-fee policy here - this is
    // the provider declining the request, not the customer backing out,
    // so it's always a full refund regardless of how close the start
    // date is.
    const changed = await bookingRepository.cancelBooking(
        bookingId, booking.service_id, items, wasPaid ? "refunded" : "rejected"
    );
    if (!changed) {
        throw new Error(`Booking can no longer be rejected (status: "${booking.status}")`);
    }

    if (wasPaid) {
        walletService.reverseProviderEarningsForBooking(
            booking.provider_id, Number(booking.amount), bookingId
        ).catch((err) => {
            logger.error({ err, bookingId }, "booking wallet reversal error");
            Sentry.captureException(err, { tags: { area: "booking", stage: "wallet-reversal" }, extra: { bookingId } });
            // Admin queue (Phase 5) - a failed reversal here means the
            // provider's wallet still shows earnings for a booking that
            // was just refunded to the buyer, so this needs a human to
            // reconcile it rather than only existing in Sentry.
            adminNotificationService.notify({
                type: "booking_wallet_reversal_failed",
                category: "finance",
                severity: "error",
                title: "Booking wallet reversal failed",
                message: `Reversing provider earnings for booking #${bookingId} failed - needs manual reconciliation.`,
                metadata: { bookingId }
            }).catch(() => {});
        });

        refundService.autoRefundForBooking({ booking, amount: Number(booking.amount), requestedBy: null })
            .catch((err) => {
                logger.error({ err, bookingId }, "booking refund error");
                Sentry.captureException(err, { tags: { area: "booking", stage: "refund" }, extra: { bookingId } });
            });
    }

    await notificationService.notify({
        userId: booking.customer_id,
        type: "booking_rejected",
        title: "Booking declined",
        message: wasPaid
            ? `Booking ${booking.booking_reference} was declined by the provider and refunded.`
            : `Booking ${booking.booking_reference} was declined by the provider.`,
        url: `/bookings/${bookingId}`
    });
};

// Either side can cancel a pending/confirmed booking - a provider
// declining a request, or a customer changing their mind. Once a
// booking is active/completed it's too late to cancel outright (that's
// what refunds are for for a payment already taken - Phase 3).
//
// Phase 5 note: a provider declining a still-pending request now has
// its own rejectBooking above; this stays as-is (still reachable by
// either side for either status, cancellable statuses unchanged) so
// nothing that already relies on cancel - customer-initiated pending
// cancellations, or either side cancelling a confirmed booking -
// changes behavior.
const CANCELLABLE_STATUSES = ["pending", "confirmed"];

// Phase 3: a cancelled booking that was never paid just needs its
// availability restored (the original behavior, unchanged below). One
// that WAS paid also needs its escrow reversed and the buyer refunded -
// CHANGES.md's Booking Lifecycle lists REFUNDED as its own exit state
// distinct from CANCELLED specifically for this case. There's no dispute
// row to hang this off of (see migration 064's design notes), so it's
// handled directly here rather than through the disputes/refunds tables
// an order-side cancellation-with-refund would eventually go through.
// Cancellation policy (Phase 5, P1) - free up to
// cancellation_free_until_days before the booking's start date;
// cancelling later than that keeps cancellation_late_fee_percent of the
// amount as a late-cancellation fee (service-level setting, services
// migration 122 - defaults are "free until 1 day before, 0% fee" so
// every existing service behaves exactly as before this phase until a
// provider actually sets stricter terms).
const applyCancellationPolicy = (booking, service) => {
    const amount = Number(booking.amount);
    if (!amount) return 0;

    const daysUntilStart = Math.ceil(
        (new Date(booking.start_date) - new Date()) / (1000 * 60 * 60 * 24)
    );
    const freeUntilDays = Number(service?.cancellation_free_until_days ?? 1);
    const lateFeePercent = Number(service?.cancellation_late_fee_percent ?? 0);

    if (daysUntilStart >= freeUntilDays || lateFeePercent <= 0) {
        return amount;
    }

    const refundable = amount * (1 - Math.min(lateFeePercent, 100) / 100);
    return Math.round(refundable * 100) / 100;
};

exports.cancelBooking = async (bookingId, userId) => {
    const booking = await loadBookingWithAccessCheck(bookingId, userId);

    if (!CANCELLABLE_STATUSES.includes(booking.status)) {
        throw new Error(`Booking can no longer be cancelled (status: "${booking.status}")`);
    }

    const wasPaid = booking.payment_status === "paid";
    const items = await bookingRepository.findItemsByBookingId(bookingId);

    // Conditional status update (Phase 5, P0) - the repository call
    // itself re-checks status IN ('pending','confirmed') against the
    // live row inside its own transaction and reports back whether it
    // actually changed anything. The service-layer check above can
    // still race a concurrent cancel (or the unpaid-booking-expiry job
    // reaching the same booking first) between that check and this
    // call - `changed === false` means we lost that race, so bail out
    // without restoring units a second time or refunding twice.
    const changed = await bookingRepository.cancelBooking(
        bookingId, booking.service_id, items, wasPaid ? "refunded" : "cancelled"
    );
    if (!changed) {
        throw new Error(`Booking can no longer be cancelled (status: "${booking.status}")`);
    }

    if (wasPaid) {
        const service = await serviceRepository.findById(booking.service_id);
        const refundAmount = applyCancellationPolicy(booking, service);

        if (refundAmount <= 0) {
            logger.info({ bookingId }, "booking cancellation: cancellation policy leaves nothing refundable");
        } else {
            // Reverse the provider's escrowed/released earnings for this
            // booking first (so the ledger reflects the reversal even if
            // the refund call below fails or needs manual follow-up).
            // Only the refundable portion is reversed, matching whatever
            // the cancellation policy above actually allows back.
            walletService.reverseProviderEarningsForBooking(
                booking.provider_id, refundAmount, bookingId
            ).catch((err) => {
                logger.error({ err, bookingId }, "booking wallet reversal error");
                Sentry.captureException(err, { tags: { area: "booking", stage: "wallet-reversal" }, extra: { bookingId } });
                adminNotificationService.notify({
                    type: "booking_wallet_reversal_failed",
                    category: "finance",
                    severity: "error",
                    title: "Booking wallet reversal failed",
                    message: `Reversing provider earnings for booking #${bookingId} failed - needs manual reconciliation.`,
                    metadata: { bookingId }
                }).catch(() => {});
            });

            // Tracked refund row (Phase 5, P0) - goes through the same
            // refunds table, retryRefund and /admin/refunds queue every
            // other refund source already uses, instead of the previous
            // fire-and-forget call with nothing persisted if it failed.
            refundService.autoRefundForBooking({ booking, amount: refundAmount, requestedBy: null })
                .catch((err) => {
                    logger.error({ err, bookingId }, "booking refund error");
                    Sentry.captureException(err, { tags: { area: "booking", stage: "refund" }, extra: { bookingId } });
                });
        }
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

// Phase 7 (UI/UX remediation) - reschedule. Buyer-only (a provider
// changing their own availability is a different concern, handled
// elsewhere), available under the exact same CANCELLABLE_STATUSES gate
// cancel already uses - if a booking can no longer be cancelled, it
// can no longer be moved either. Re-runs the same date-list/pricing/
// availability validation createBooking does for the new dates
// (buildDateList, priceDateItems) so a rescheduled booking is priced
// and validated identically to a fresh one, just without losing the
// booking's own id/history/payment record in the process.
// Unpaid booking expiry (Phase 5, P1) - called from bookingExpiry.job.js.
// Reuses the same conditional cancelBooking repository call (status IN
// ('pending','confirmed') -> 'cancelled') the customer-cancel path uses,
// so an expiry racing an actual customer cancel/payment-just-succeeded
// can't double-release availability either.
exports.expireUnpaidBooking = async (booking) => {
    const items = await bookingRepository.findItemsByBookingId(booking.id);
    const changed = await bookingRepository.cancelBooking(booking.id, booking.service_id, items, "cancelled");
    if (!changed) return false;

    await notificationService.notify({
        userId: booking.customer_id,
        type: "booking_expired",
        title: "Booking expired",
        message: `Booking ${booking.booking_reference} was cancelled because payment was never completed.`,
        url: `/bookings/${booking.id}`
    }).catch(() => {});

    return true;
};

exports.rescheduleBooking = async (bookingId, customerId, newStartDate, newEndDate) => {
    const booking = await bookingRepository.findById(bookingId);

    if (!booking || booking.customer_id !== customerId) {
        throw new Error("Booking not found");
    }

    if (!CANCELLABLE_STATUSES.includes(booking.status)) {
        throw new Error(`Booking can no longer be rescheduled (status: "${booking.status}")`);
    }

    const service = await serviceRepository.findById(booking.service_id);
    if (!service) {
        throw new Error("Service not found");
    }

    if (service.pricing_model !== "per_night" && newStartDate !== newEndDate) {
        throw new Error("This service is booked for a single date");
    }
    if (new Date(newStartDate) > new Date(newEndDate)) {
        throw new Error("Start date must be on or before the end date");
    }

    const newDates = buildDateList(service.pricing_model, newStartDate, newEndDate);
    if (newDates.length === 0) {
        throw new Error("A per-night booking needs at least one night");
    }

    const oldItems = await bookingRepository.findItemsByBookingId(bookingId);
    const newDateItems = await priceDateItems(service, newDates, booking.quantity);
    const newAmount = newDateItems.reduce((sum, item) => sum + item.subtotal, 0);

    // A paid booking's amount is already settled (charged, and reflected
    // in the provider's escrowed earnings) - silently changing it here
    // would desync the booking record from money that's already moved.
    // Rather than attempt a partial-charge/refund reconciliation (out of
    // scope for this feature), a price-changing reschedule on a paid
    // booking is simply not allowed; the buyer can cancel (which does
    // already have full refund handling, see cancelBooking above) and
    // rebook instead.
    if (booking.payment_status === "paid" && Number(newAmount) !== Number(booking.amount)) {
        throw new Error("These dates have a different price - cancel and rebook instead, or choose dates priced the same as your current booking");
    }

    await bookingRepository.rescheduleBooking(
        bookingId, booking.service_id, oldItems,
        newStartDate, newEndDate, booking.quantity, newDateItems, newAmount
    );

    await notificationService.notify({
        userId: booking.provider_id,
        type: "booking_rescheduled",
        title: "Booking rescheduled",
        message: `Booking ${booking.booking_reference} was moved to ${newStartDate}${newEndDate !== newStartDate ? ` – ${newEndDate}` : ""}.`,
        url: `/seller/bookings/${bookingId}`
    });

    return { bookingId, amount: newAmount };
};
