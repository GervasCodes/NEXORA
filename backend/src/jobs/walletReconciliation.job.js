// Nightly wallet reconciliation (Phase 2, P1). Recomputes every seller and
// buyer wallet's balance from its own ledger (wallet_transactions /
// buyer_wallet_transactions) and compares it with the balance actually
// sitting on the wallet row - see wallet.service.js#reconcileWallets for
// the actual comparison. Any mismatch is recorded in
// wallet_reconciliation_flags for admins to review; this job never
// "fixes" a drifted balance itself, since telling a real bug apart from a
// legitimate manual adjustment needs a human.
const walletService = require("../modules/wallet/wallet.service");
const logger = require("../utils/logger").child({ module: "job:walletReconciliation" });
const Sentry = require("../config/sentry");

exports.run = async () => {
    try {
        const summary = await walletService.reconcileWallets();

        if (summary.sellerDriftCount || summary.buyerDriftCount) {
            logger.warn(summary, "wallet reconciliation found drift - flagged for admin review");
        }
    } catch (error) {
        logger.error({ err: error }, "wallet reconciliation job failed");
        Sentry.captureException(error, { tags: { area: "wallet", stage: "reconciliation-job" } });
    }
};
