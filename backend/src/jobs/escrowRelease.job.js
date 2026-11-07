// Seller Release. Runs on a schedule (see jobs/index.js) and
// releases held seller earnings ( held_balance) into
// withdrawable balance once an order is delivered and
// settings.escrow_hold_days has elapsed with no open dispute - see
// docs/ESCROW_ANALYSIS.md for the full design and
// wallet.service.js#releaseEligibleEarnings for the actual release/
// freeze/close-by-dispute logic. This job is a thin scheduling wrapper
// around that function, matching the shape of every other job in this
// directory.
//
// Financial Integration) added the booking
// equivalent, wallet.service.js#releaseEligibleBookingEarnings - run
// from the same tick rather than a second cron entry, since it's the
// exact same "release whatever's past its hold window" sweep just
// against booking_items instead of order_items (see migration 064).
//
// Rider earnings hold (Phase 2) added a third leg, earnings.service.js#
// releaseEligibleEarnings, for the exact same reason: a delivery agent's
// per-order earning is now held the same way, so it releases on the same
// tick as the seller/provider sweeps above rather than needing its own
// schedule.
const walletService = require("../modules/wallet/wallet.service");
const earningsService = require("../modules/earnings/earnings.service");
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

    const agentEarningsSummary = await earningsService.releaseEligibleEarnings();

    if (agentEarningsSummary.released) {
        logger.info({
            released: agentEarningsSummary.released,
            errored: agentEarningsSummary.errored
        }, "escrow release sweep (agent earnings)");
    }
};
