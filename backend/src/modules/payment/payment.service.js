const paymentRepository = require("./payment.repository");
const orderRepository = require("../order/order.repository");
const mobileMoneyProvider = require("./providers/mobileMoney.provider");
const walletService = require("../wallet/wallet.service");

const generateReceiptNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `RCPT-${timestamp}-${random}`;
};

exports.initiateMobileMoneyPayment = async (orderId, buyerId) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order || order.buyer_id !== buyerId) {
        throw new Error("Order not found");
    }

    if (order.payment_method !== "mobile_money") {
        throw new Error("This order is not set up for mobile money payment");
    }

    if (order.payment_status === "paid") {
        throw new Error("This order has already been paid");
    }

    let payment = await paymentRepository.findByOrderId(orderId);

    if (!payment) {
        const paymentId = await paymentRepository.create(
            orderId,
            "mobile_money",
            order.total_amount
        );
        payment = { id: paymentId };
    }

    // This reference is what ties the provider's webhook back to this
    // order/payment when the buyer actually confirms on their phone -
    // that's a separate, later HTTP call from MalipoPay/Selcom's servers,
    // not part of this request/response cycle.
    const reference = `ORDER-${orderId}`;

    let providerResult;
    try {
        providerResult = await mobileMoneyProvider.initiate(
            order.shipping_phone,
            order.total_amount,
            { reference, description: `NEXORA order #${orderId}` }
        );
    } catch (error) {
        await paymentRepository.markFailed(payment.id);
        throw error;
    }

    if (!providerResult.success) {
        await paymentRepository.markFailed(payment.id);
        throw new Error("Payment could not be initiated. Please try again");
    }

    // Do NOT mark completed here. `initiate` only means "the USSD prompt
    // was sent to the buyer's phone" - the buyer still has to enter their
    // PIN. The actual success/failure arrives later via the provider's
    // webhook (see handleProviderWebhook below), which is what marks the
    // payment completed and credits sellers.
    await paymentRepository.markPending(payment.id, providerResult.transactionReference);

    return {
        status: "pending",
        message: "Check your phone to complete the payment.",
        transactionReference: providerResult.transactionReference
    };
};

// Called by payment.controller's webhook handlers once MalipoPay/Selcom
// confirm the buyer actually completed (or failed/cancelled) the payment
// on their end. `providerReference` is the reference WE sent when calling
// initiate (e.g. "ORDER-42") - see `reference` above.
exports.handleProviderWebhook = async ({ providerReference, success, transactionReference }) => {
    const match = /^ORDER-(\d+)$/.exec(providerReference || "");
    if (!match) {
        throw new Error(`Unrecognized payment reference: ${providerReference}`);
    }

    const orderId = Number(match[1]);
    const payment = await paymentRepository.findByOrderId(orderId);

    if (!payment) {
        throw new Error(`No payment record found for order #${orderId}`);
    }

    // Already processed - webhooks can be retried/duplicated by the
    // provider, so treat this as a no-op rather than an error.
    if (payment.status === "completed" || payment.status === "failed") {
        return { alreadyProcessed: true };
    }

    if (!success) {
        await paymentRepository.markFailed(payment.id);
        return { orderId, success: false };
    }

    const receiptNumber = generateReceiptNumber();

    await paymentRepository.markCompleted(payment.id, transactionReference, receiptNumber);
    await orderRepository.updatePaymentStatus(orderId, "paid");

    walletService.creditSellersForOrder(orderId).catch((err) =>
        console.error("Seller wallet credit error:", err)
    );

    return { orderId, success: true, receiptNumber };
};

exports.getPayment = async (orderId, userId) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order) {
        throw new Error("Order not found");
    }

    const isBuyer = order.buyer_id === userId;
    const ownsItem = isBuyer
        ? true
        : await orderRepository.sellerHasItemInOrder(orderId, userId);

    if (!ownsItem) {
        throw new Error("Order not found");
    }

    const payment = await paymentRepository.findByOrderId(orderId);

    if (!payment) {
        throw new Error("No payment record for this order yet");
    }

    return payment;
};

// Cash on Delivery: only confirm once the order has actually been delivered
exports.confirmCashOnDelivery = async (orderId, sellerId) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order) {
        throw new Error("Order not found");
    }

    const ownsItem = await orderRepository.sellerHasItemInOrder(orderId, sellerId);
    if (!ownsItem) {
        throw new Error("Order not found");
    }

    if (order.payment_method !== "cash_on_delivery") {
        throw new Error("This order is not a Cash on Delivery order");
    }

    if (order.status !== "delivered") {
        throw new Error("Cash on Delivery can only be confirmed after delivery");
    }

    let payment = await paymentRepository.findByOrderId(orderId);

    if (!payment) {
        const paymentId = await paymentRepository.create(
            orderId,
            "cash_on_delivery",
            order.total_amount
        );
        payment = { id: paymentId };
    }

    const receiptNumber = generateReceiptNumber();

    await paymentRepository.markCompleted(payment.id, null, receiptNumber);
    await orderRepository.updatePaymentStatus(orderId, "paid");

    walletService.creditSellersForOrder(orderId).catch((err) =>
        console.error("Seller wallet credit error:", err)
    );

    return { receiptNumber };
};