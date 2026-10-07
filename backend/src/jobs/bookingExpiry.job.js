/**
 * Unpaid booking expiry (Phase 5, P1).
 *
 * A booking reserves availability units at creation time, before
 * payment - a buyer who starts a booking and never completes payment
 * previously left that availability locked indefinitely. This releases
 * it after STALE_BOOKING_MINUTES (mirrors staleOrders.job.js's own
 * env-overridable pattern for the equivalent order-side problem).
 */

const bookingRepository = require("../modules/booking/booking.repository");
const bookingService = require("../modules/booking/booking.service");
const Sentry = require("../config/sentry");
const logger = require("../utils/logger").child({ module: "job:bookingExpiry" });

const STALE_BOOKING_MINUTES = Number(process.env.STALE_BOOKING_MINUTES) || 120;

exports.run = async () => {
    const stale = await bookingRepository.findStaleUnpaid(STALE_BOOKING_MINUTES);

    let expired = 0;
    for (const booking of stale) {
        try {
            const changed = await bookingService.expireUnpaidBooking(booking);
            if (changed) expired += 1;
        } catch (err) {
            // Per-booking try/catch (same reasoning as escrowRelease.job.js
            // and the group-buy/sponsorship expiry sweeps) - one bad row
            // shouldn't block the rest of the sweep.
            logger.error({ err, bookingId: booking.id }, "booking expiry error");
            Sentry.captureException(err, { tags: { area: "booking", stage: "expiry-sweep" }, extra: { bookingId: booking.id } });
        }
    }

    if (stale.length) {
        logger.info({ found: stale.length, expired }, "unpaid booking expiry sweep");
    }
};
