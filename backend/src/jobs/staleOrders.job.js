
const orderRepository = require("../modules/order/order.repository");
const orderService = require("../modules/order/order.service");
const paymentRepository = require("../modules/payment/payment.repository");

const STALE_AFTER_MINUTES = 120;

exports.run = async () => {
    const staleOrders = await orderRepository.findStalePendingMobileMoneyOrders(STALE_AFTER_MINUTES);

    for (const order of staleOrders) {
        try {
            await orderService.autoCancelStaleOrder(order);
        } catch (error) {
            console.error(`[staleOrders job] failed to cancel order #${order.id}:`, error.message);
        }
    }

    
    const stalePayments = await paymentRepository.findStalePending(STALE_AFTER_MINUTES);

    for (const payment of stalePayments) {
        try {
            await paymentRepository.markFailed(payment.id);
        } catch (error) {
            console.error(`[staleOrders job] failed to mark payment #${payment.id} failed:`, error.message);
        }
    }

    if (staleOrders.length || stalePayments.length) {
        console.log(`[staleOrders job] cancelled ${staleOrders.length} order(s), closed ${stalePayments.length} stale payment(s)`);
    }
};
