const earningsRepository = require("./earnings.repository");
const deliveryRepository = require("../delivery/delivery.repository");
const settingsService = require("../settings/settings.service");
const logger = require("../../utils/logger").child({ module: "earnings" });
const Sentry = require("../../config/sentry");

// Called from delivery.service when a delivery is marked "delivered".
// Uses whatever fee was snapshotted onto the delivery at assignment time
// (falling back to the current platform setting if, for some reason,
// nothing was snapshotted) and guards against double-crediting the same
// delivery via the deliveries.earnings_credited flag.
exports.creditForDelivery = async (delivery) => {
    const credited = await deliveryRepository.markEarningsCredited(delivery.id);
    if (!credited) return; // already paid out for this delivery

    const amount = delivery.delivery_fee != null
        ? Number(delivery.delivery_fee)
        : await settingsService.getRiderDeliveryFee();

    await earningsRepository.insertEarning(delivery.agent_id, delivery.id, delivery.order_id, amount);
};

exports.getDashboard = async (agentId) => {
    const totals = await earningsRepository.getTotals(agentId);
    const dailyBreakdown = await earningsRepository.getDailyBreakdown(agentId, 14);
    const recent = await earningsRepository.findRecent(agentId, 20);
    const holdDays = await settingsService.getEscrowHoldDays();

    // Payout status per row: released rows carry released_at; held rows get
    // an upper-bound release date (created_at + hold window). Buyer
    // confirmation can release a held row earlier than this date.
    const recentWithStatus = recent.map((row) => {
        if (row.status !== "held") return row;
        const heldUntil = new Date(new Date(row.created_at).getTime() + holdDays * 24 * 60 * 60 * 1000);
        return { ...row, held_until: heldUntil.toISOString() };
    });

    return {
        holdDays,
        totalEarnings: Number(totals.total_earnings),
        totalDeliveries: Number(totals.total_deliveries),
        todayEarnings: Number(totals.today_earnings),
        weekEarnings: Number(totals.week_earnings),
        monthEarnings: Number(totals.month_earnings),
        heldEarnings: Number(totals.held_earnings),
        dailyBreakdown: dailyBreakdown.map((row) => ({
            day: row.day,
            amount: Number(row.amount),
            deliveries: Number(row.deliveries)
        })),
        recent: recentWithStatus
    };
};

// Rider earnings hold (Phase 2, P1) - a delivery agent's earnings are
// recorded 'held' at the moment of delivery (see creditForDelivery above,
// and agent_earnings.status's DEFAULT in migration 120) and only become
// visible in the agent's "earnings" totals once released here: after the
// same escrow_hold_days window sellers' own held earnings use, or
// immediately once the buyer explicitly confirms receipt - whichever
// happens first. Called from the same sweep as the seller/booking escrow
// release (see jobs/escrowRelease.job.js), and isolates one bad row from
// the rest of the sweep the same way releaseItems/releaseBookingItems do.
exports.releaseEligibleEarnings = async () => {
    const holdDays = await settingsService.getEscrowHoldDays();
    const rows = await earningsRepository.findReleasable(holdDays);

    let released = 0;
    let errored = 0;

    for (const row of rows) {
        try {
            await earningsRepository.markReleased(row.id);
            released += 1;
        } catch (error) {
            errored += 1;
            logger.error({ err: error, agentEarningId: row.id, orderId: row.order_id }, "agent earnings release error for one row - skipped, will retry next sweep");
            Sentry.captureException(error, { tags: { area: "earnings", stage: "release" }, extra: { agentEarningId: row.id, orderId: row.order_id } });
        }
    }

    return { released, errored };
};
