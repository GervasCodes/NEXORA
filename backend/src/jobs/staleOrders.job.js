
const orderRepository = require("../modules/order/order.repository");
const orderService = require("../modules/order/order.service");
const paymentRepository = require("../modules/payment/payment.repository");
const logger = require("../utils/logger").child({ module: "job:staleOrders" });
const Sentry = require("../config/sentry");

const STALE_AFTER_MINUTES = 120;

exports.run = async () => {
    const staleOrders = await orderRepository.findStalePendingMobileMoneyOrders(STALE_AFTER_MINUTES);

    for (const order of staleOrders) {
        try {
            await orderService.autoCancelStaleOrder(order);
        } catch (error) {
            logger.error({ err: error, orderId: order.id }, "failed to cancel stale order");
            Sentry.captureException(error, { tags: { area: "job:staleOrders", stage: "cancel-order" }, extra: { orderId: order.id } });
        }
    }


    const stalePayments = await paymentRepository.findStalePending(STALE_AFTER_MINUTES);

    for (const payment of stalePayments) {
        try {
            await paymentRepository.markFailed(payment.id);
        } catch (error) {
            logger.error({ err: error, paymentId: payment.id }, "failed to mark stale payment failed");
            Sentry.captureException(error, { tags: { area: "job:staleOrders", stage: "mark-payment-failed" }, extra: { paymentId: payment.id } });
        }
    }

    if (staleOrders.length || stalePayments.length) {
        logger.info({ cancelledOrders: staleOrders.length, closedPayments: stalePayments.length }, "stale orders/payments swept");
    }
};
