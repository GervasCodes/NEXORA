// Cash on Delivery auto-confirm (Phase 2, P0). Cash on Delivery used to
// depend entirely on the buyer remembering to tap "confirm receipt" (see
// payment.service.js#confirmDeliveryReceipt) - a buyer who simply forgets
// leaves the seller's earnings (and the platform's commission debit) stuck
// forever with no payment record at all. This runs on a schedule (see
// jobs/index.js) and auto-confirms any Cash on Delivery order that's been
// sitting "delivered" for longer than settings.cod_auto_confirm_hours with
// no open dispute - see order.repository.js#findCodOrdersPendingAutoConfirm
// for the exact eligibility query and payment.service.js#autoConfirmCodDelivery
// for what actually happens to each one.
const orderRepository = require("../modules/order/order.repository");
const paymentService = require("../modules/payment/payment.service");
const settingsService = require("../modules/settings/settings.service");
const logger = require("../utils/logger").child({ module: "job:codAutoConfirm" });
const Sentry = require("../config/sentry");

exports.run = async () => {
    const hours = await settingsService.getCodAutoConfirmHours();
    const candidates = await orderRepository.findCodOrdersPendingAutoConfirm(hours);

    let confirmed = 0;
    let errored = 0;

    for (const order of candidates) {
        // One bad order must never block the rest of the sweep - same
        // per-row isolation as the escrow release job.
        try {
            const result = await paymentService.autoConfirmCodDelivery(order);
            if (result.confirmed) confirmed += 1;
        } catch (error) {
            errored += 1;
            logger.error({ err: error, orderId: order.id }, "Cash on Delivery auto-confirm error for one order - skipped, will retry next sweep");
            Sentry.captureException(error, { tags: { area: "payment", stage: "cod-auto-confirm" }, extra: { orderId: order.id } });
        }
    }

    if (confirmed || errored) {
        logger.info({ confirmed, errored, candidateCount: candidates.length }, "Cash on Delivery auto-confirm sweep");
    }
};
