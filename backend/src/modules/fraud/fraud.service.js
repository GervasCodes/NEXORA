const fraudRepository = require("./fraud.repository");

// Deliberately simple, explainable rules rather than a model - each one
// should be something an admin reviewing a flag can immediately
// understand ("why was this flagged?") without needing to trust a black
// box. Thresholds are conservative on purpose: false positives cost an
// admin a few seconds reviewing and dismissing a flag, but a rule that's
// too aggressive trains admins to ignore this feature entirely.

const HIGH_VALUE_FIRST_ORDER_THRESHOLD = 1_000_000; // TZS
const VELOCITY_WINDOW_MINUTES = 10;
const VELOCITY_ORDER_COUNT = 3;
const WITHDRAWAL_OUTLIER_MULTIPLIER = 4;
const MIN_WITHDRAWAL_HISTORY_FOR_OUTLIER_CHECK = 2;

// Called after an order is created (order.service.checkout). Deliberately
// fire-and-forget from the caller's side - a flagging failure should
// never block checkout.
exports.evaluateOrder = async (order) => {
    const { priorOrderCount } = await fraudRepository.getBuyerPriorOrderStats(order.buyer_id);
    // priorOrderCount includes the order just created, since it's already
    // been inserted by the time this runs - so "1" means this IS their
    // first order.
    const isFirstOrder = priorOrderCount <= 1;

    if (isFirstOrder && Number(order.total_amount) >= HIGH_VALUE_FIRST_ORDER_THRESHOLD) {
        await flagOnce("order", order.id, "high_value_first_order",
            `First-ever order from this buyer is unusually large (${Math.round(order.total_amount).toLocaleString()} TZS).`,
            "medium");
    }

    const recentCount = await fraudRepository.countRecentOrdersByBuyer(order.buyer_id, VELOCITY_WINDOW_MINUTES);
    if (recentCount >= VELOCITY_ORDER_COUNT) {
        await flagOnce("order", order.id, "order_velocity",
            `This buyer placed ${recentCount} orders within ${VELOCITY_WINDOW_MINUTES} minutes.`,
            "medium");
    }
};

// Called after a withdrawal request is created (wallet.service.requestWithdrawal).
exports.evaluateWithdrawal = async (sellerId, amount) => {
    const { priorCount, avgAmount } = await fraudRepository.getSellerPriorWithdrawalStats(sellerId);

    if (priorCount < MIN_WITHDRAWAL_HISTORY_FOR_OUTLIER_CHECK || avgAmount <= 0) {
        return; // Not enough history yet to know what "normal" looks like for this seller.
    }

    if (Number(amount) >= avgAmount * WITHDRAWAL_OUTLIER_MULTIPLIER) {
        await flagOnce("seller", sellerId, "withdrawal_outlier",
            `Withdrawal request (${Math.round(amount).toLocaleString()} TZS) is over ${WITHDRAWAL_OUTLIER_MULTIPLIER}x this seller's usual amount (avg ${Math.round(avgAmount).toLocaleString()} TZS).`,
            "high");
    }
};

async function flagOnce(entityType, entityId, ruleCode, reason, severity) {
    const alreadyFlagged = await fraudRepository.hasOpenFlag(entityType, entityId, ruleCode);
    if (alreadyFlagged) return;
    await fraudRepository.createFlag({ entityType, entityId, ruleCode, reason, severity });
}

exports.listOpenFlags = async () => fraudRepository.findOpen();

exports.resolveFlag = async (id, status, adminId) => {
    if (!["dismissed", "confirmed"].includes(status)) {
        throw new Error("Invalid resolution status");
    }
    await fraudRepository.resolve(id, status, adminId);
};
