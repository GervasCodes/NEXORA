// Phase 9D - Seller Release. Runs on a schedule (see jobs/index.js) and
// releases held seller earnings (Phase 9C's held_balance) into
// withdrawable balance once an order is delivered and
// settings.escrow_hold_days has elapsed with no open dispute - see
// docs/ESCROW_ANALYSIS.md for the full design and
// wallet.service.js#releaseEligibleEarnings for the actual release/
// freeze/close-by-dispute logic. This job is a thin scheduling wrapper
// around that function, matching the shape of every other job in this
// directory.
//
// Phase 3 (Nexora Services - Financial Integration) added the booking
// equivalent, wallet.service.js#releaseEligibleBookingEarnings - run
// from the same tick rather than a second cron entry, since it's the
// exact same "release whatever's past its hold window" sweep just
// against booking_items instead of order_items (see migration 064).
const walletService = require("../modules/wallet/wallet.service");
const logger = require("../utils/logger").child({ module: "job:escrowRelease" });

exports.run = async () => {
    const summary = await walletService.releaseEligibleEarnings();

    if (summary.released || summary.closedByDispute || summary.frozen) {
        logger.info({
            released: summary.released,
            amountReleased: summary.amountReleased,
            closedByDispute: summary.closedByDispute,
            frozen: summary.frozen
        }, "escrow release sweep (orders)");
    }

    const bookingSummary = await walletService.releaseEligibleBookingEarnings();

    if (bookingSummary.released) {
        logger.info({
            released: bookingSummary.released,
            amountReleased: bookingSummary.amountReleased
        }, "escrow release sweep (bookings)");
    }
};
