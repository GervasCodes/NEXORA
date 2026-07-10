const earningsRepository = require("./earnings.repository");
const deliveryRepository = require("../delivery/delivery.repository");
const settingsService = require("../settings/settings.service");

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

    return {
        totalEarnings: Number(totals.total_earnings),
        totalDeliveries: Number(totals.total_deliveries),
        todayEarnings: Number(totals.today_earnings),
        weekEarnings: Number(totals.week_earnings),
        monthEarnings: Number(totals.month_earnings),
        dailyBreakdown: dailyBreakdown.map((row) => ({
            day: row.day,
            amount: Number(row.amount),
            deliveries: Number(row.deliveries)
        })),
        recent
    };
};
