const orderRepository = require("../modules/order/order.repository");
const orderService = require("../modules/order/order.service");
const paymentRepository = require("../modules/payment/payment.repository");
const paymentService = require("../modules/payment/payment.service");
const paymentReviewService = require("../modules/payment/paymentReview.service");
const notificationService = require("../modules/notification/notification.service");
const logger = require("../utils/logger").child({ module: "job:staleOrders" });
const Sentry = require("../config/sentry");

// How long a payment attempt may stay unconfirmed before this sweep asks the
// provider about it. A USSD prompt is short-lived; a hosted checkout session
// (card / PayPal) legitimately stays open much longer.
const STALE_AFTER_MINUTES = Number(process.env.STALE_PAYMENT_MINUTES) || 120;
const HOSTED_STALE_AFTER_MINUTES = Number(process.env.STALE_HOSTED_PAYMENT_MINUTES) || 24 * 60;

// A provider that cannot tell us the status of a payment (no lookup exists,
// or the lookup itself errored) is only failed after this much longer. Even
// then it is safe: money that turns up later is applied, or flagged for a
// refund, by the webhook handlers - never dropped.
const HARD_CUTOFF_MINUTES = Number(process.env.STALE_PAYMENT_HARD_MINUTES) || 24 * 60;
const HOSTED_HARD_CUTOFF_MINUTES = Number(process.env.STALE_HOSTED_PAYMENT_HARD_MINUTES) || 72 * 60;
const WALLET_STALE_AFTER_MINUTES = 60;

const HOSTED_METHODS = new Set(["snippe", "malipopay_card", "paypal"]);

const ageMinutes = (payment) => (Date.now() - new Date(payment.created_at).getTime()) / 60000;

// Who to tell "we did not receive your payment". Order payments are covered
// by the order-cancelled notification the sweep sends when it cancels the
// order, so they are not notified twice.
const notifyPaymentNotReceived = async (payment) => {
    let userId = null;
    let url = "/";

    if (payment.purpose === "booking_payment") {
        const booking = await require("../modules/booking/booking.repository").findById(payment.booking_id);
        userId = booking ? booking.customer_id : null;
        url = `/bookings/${payment.booking_id}`;
    } else if (payment.purpose === "subscription_payment") {
        userId = payment.seller_id;
        url = "/seller/subscription";
    } else if (payment.purpose === "wallet_topup") {
        userId = payment.seller_id;
        url = "/wallet";
    }

    if (!userId) return;

    await notificationService.notify({
        userId,
        type: "payment_not_received",
        titleKey: "notifications.payment.notReceived.title",
        messageKey: "notifications.payment.notReceived.message",
        url,
        withEmail: true
    });
};

const sweepStalePayments = async () => {
    const stalePayments = await paymentRepository.findStalePending({
        cutoffMinutes: STALE_AFTER_MINUTES,
        hostedCutoffMinutes: HOSTED_STALE_AFTER_MINUTES
    });

    const counts = { applied: 0, failed: 0, stillPending: 0, unverifiable: 0, errors: 0 };

    for (const payment of stalePayments) {
        try {
            const hardCutoff = HOSTED_METHODS.has(payment.method) ? HOSTED_HARD_CUTOFF_MINUTES : HARD_CUTOFF_MINUTES;
            const { outcome } = await paymentService.settleStalePayment(payment, {
                unverifiableCutoffPassed: ageMinutes(payment) >= hardCutoff
            });

            if (outcome === "applied") counts.applied += 1;
            else if (outcome === "failed") {
                counts.failed += 1;
                await notifyPaymentNotReceived(payment).catch((err) => logger.warn({ err, paymentId: payment.id }, "payment-not-received notify error"));
            } else if (outcome === "still_pending") counts.stillPending += 1;
            else counts.unverifiable += 1;
        } catch (error) {
            counts.errors += 1;
            logger.error({ err: error, paymentId: payment.id }, "failed to settle stale payment");
            Sentry.captureException(error, { tags: { area: "job:staleOrders", stage: "settle-payment" }, extra: { paymentId: payment.id } });
        }
    }

    return counts;
};

// A wallet payment is a synchronous internal debit: a row still pending an
// hour later is dead. If the buyer's wallet WAS debited for it, the money
// left the wallet without the order being paid - that goes to admin review
// instead of being closed.
const sweepStaleWalletPayments = async () => {
    const rows = await paymentRepository.findStaleWalletPending(WALLET_STALE_AFTER_MINUTES);
    let closed = 0;

    for (const payment of rows) {
        try {
            if (payment.order_id && await paymentRepository.hasWalletDebitForOrder(payment.order_id)) {
                await paymentReviewService.flag({
                    payment,
                    reason: paymentReviewService.REASONS.APPLY_FAILED,
                    severity: "critical",
                    details: { stage: "wallet-debit", note: "Buyer wallet was debited but the order payment never completed" }
                });
                continue;
            }

            if (await paymentRepository.markFailed(payment.id)) closed += 1;
        } catch (error) {
            logger.error({ err: error, paymentId: payment.id }, "failed to close stale wallet payment");
            Sentry.captureException(error, { tags: { area: "job:staleOrders", stage: "wallet-payment" }, extra: { paymentId: payment.id } });
        }
    }

    return closed;
};

exports.run = async () => {
    // 1. Settle stale payments FIRST - each is checked with its provider, so
    //    a payment that actually succeeded is applied, not failed.
    const paymentCounts = await sweepStalePayments();
    const walletClosed = await sweepStaleWalletPayments();

    // 2. Then cancel unpaid orders that have nothing pending or completed.
    const staleOrders = await orderRepository.findStaleUnpaidOrders({
        cutoffMinutes: STALE_AFTER_MINUTES,
        hostedCutoffMinutes: HOSTED_STALE_AFTER_MINUTES
    });

    let cancelledOrders = 0;
    for (const order of staleOrders) {
        try {
            await orderService.autoCancelStaleOrder(order);
            cancelledOrders += 1;
        } catch (error) {
            logger.error({ err: error, orderId: order.id }, "failed to cancel stale order");
            Sentry.captureException(error, { tags: { area: "job:staleOrders", stage: "cancel-order" }, extra: { orderId: order.id } });
        }
    }

    if (staleOrders.length || Object.values(paymentCounts).some(Boolean) || walletClosed) {
        logger.info({ cancelledOrders, walletClosed, ...paymentCounts }, "stale orders/payments swept");
    }
};
