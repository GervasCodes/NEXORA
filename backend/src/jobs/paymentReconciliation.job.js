const paymentRepository = require("../modules/payment/payment.repository");
const paymentService = require("../modules/payment/payment.service");
const logger = require("../utils/logger").child({ module: "job:paymentReconciliation" });
const Sentry = require("../config/sentry");

const LOOKBACK_DAYS = Number(process.env.PAYMENT_RECONCILIATION_DAYS) || 7;

// Daily: every provider payment from the last few days that we do NOT hold
// as completed is checked with its provider. Anything the provider says was
// paid goes into the admin review queue ("completed at provider, not
// completed here") - an admin then accepts it (applies it) or refunds it.
// Nothing is applied automatically here, and an item already in the queue
// is not re-alerted.
exports.run = async () => {
    const candidates = await paymentRepository.findUnsettledForReconciliation(LOOKBACK_DAYS);
    let flagged = 0;
    let errors = 0;

    for (const payment of candidates) {
        try {
            const result = await paymentService.reconcileUnsettledPayment(payment);
            if (result.flagged) flagged += 1;
        } catch (error) {
            errors += 1;
            logger.error({ err: error, paymentId: payment.id }, "payment reconciliation failed for one payment");
            Sentry.captureException(error, { tags: { area: "job:paymentReconciliation" }, extra: { paymentId: payment.id } });
        }
    }

    logger.info({ checked: candidates.length, flagged, errors }, "payment reconciliation finished");
};
