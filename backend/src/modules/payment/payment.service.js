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

    let providerResult;
    try {
        providerResult = await mobileMoneyProvider.initiate(
            order.shipping_phone,
            order.total_amount
        );
    } catch (error) {
        await paymentRepository.markFailed(payment.id);
        throw error;
    }

    if (!providerResult.success) {
        await paymentRepository.markFailed(payment.id);
        throw new Error("Payment could not be initiated. Please try again");
    }

    const receiptNumber = generateReceiptNumber();

    await paymentRepository.markCompleted(
        payment.id,
        providerResult.transactionReference,
        receiptNumber
    );

    await orderRepository.updatePaymentStatus(orderId, "paid");

    walletService.creditSellersForOrder(orderId).catch((err) =>
        console.error("Seller wallet credit error:", err)
    );

    return {
        receiptNumber,
        transactionReference: providerResult.transactionReference
    };
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
