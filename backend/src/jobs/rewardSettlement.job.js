// Hourly settlement of affiliate commissions, loyalty points and referral
// bonuses after delivery and the return window, plus reversal for cancelled
// or refunded orders (Phase 6). See rewardSettlement.service.js.

const rewardSettlementService = require("../modules/rewardSettlement/rewardSettlement.service");
const logger = require("../utils/logger").child({ module: "job:rewardSettlement" });

exports.run = async () => {
    const settled = await rewardSettlementService.settleMaturedOrders();
    const reversed = await rewardSettlementService.reverseVoidedOrders();

    if (settled || reversed) {
        logger.info({ settled, reversed }, "reward settlement tick");
    }
};
