// Resolves group buys whose deadline has passed (Phase Q7) - see
// groupBuy.service.js#sweepExpired's header comment. Idempotent: only
// touches group_buys still in 'open' with a past deadline, so a missed
// tick or a manual retry never double-resolves one.

const groupBuyService = require("../modules/groupBuy/groupBuy.service");
const logger = require("../utils/logger").child({ module: "job:groupBuyExpiry" });

exports.run = async () => {
    const { resolved } = await groupBuyService.sweepExpired();

    if (resolved) {
        logger.info({ resolved }, "resolved expired group buy(s)");
    }
};
