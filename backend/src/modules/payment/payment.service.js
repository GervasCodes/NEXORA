const paymentRepository = require("./payment.repository");
const orderRepository = require("../order/order.repository");
const mobileMoneyProvider = require("./providers/mobileMoney.provider");
const snippeProvider = require("./providers/snippe.provider");
const paypalProvider = require("./providers/paypal.provider");
const walletService = require("../wallet/wallet.service");
const settingsService = require("../settings/settings.service");
const auditService = require("../audit/audit.service");

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

// Seller verification fee, mobile-money route. Mirrors
// initiateMobileMoneyPayment above: `initiate()` only means the USSD
// prompt was sent to the seller's phone, NOT that they've paid. The fee
// is only marked paid - and the badge only synced - once the provider's
// webhook confirms success below. (Previously this flow marked the fee
// paid immediately after initiate() returned, before the seller had
// actually entered their PIN - this is the fix for that.)
exports.initiateVerificationFeePayment = async (sellerId, phone, amount) => {
    const existingPending = await paymentRepository.findPendingVerificationFeePayment(sellerId);
    const paymentId = existingPending
        ? existingPending.id
        : await paymentRepository.createVerificationFeePayment(sellerId, amount);

    const reference = `VERIFY-${sellerId}`;

    let providerResult;
    try {
        providerResult = await mobileMoneyProvider.initiate(phone, amount, {
            reference,
            purpose: "seller_verification_fee",
            description: "NEXORA seller verification fee"
        });
    } catch (error) {
        await paymentRepository.markFailed(paymentId);
        throw error;
    }

    if (!providerResult.success) {
        await paymentRepository.markFailed(paymentId);
        throw new Error("Payment could not be initiated. Please try again");
    }

    await paymentRepository.markPending(paymentId, providerResult.transactionReference);

    return {
        status: "pending",
        message: "Check your phone to complete the payment. Your Verified Seller badge will unlock automatically once payment is confirmed.",
        transactionReference: providerResult.transactionReference
    };
};

// Called by payment.controller's webhook handlers once MalipoPay/Selcom/
// Snippe confirm the buyer/seller actually completed (or failed/cancelled)
// the payment on their end, or by the PayPal capture flow once we've
// confirmed a capture server-side. `providerReference` is the reference WE
// sent when initiating the payment: "ORDER-42" for order payments,
// "VERIFY-7" for a seller's verification fee - see the two `reference`
// values above. `chargedCurrency`/`chargedAmount` are only passed for
// foreign-currency gateways (PayPal) - see migration 028.
exports.handleProviderWebhook = async ({ providerReference, success, transactionReference, chargedCurrency, chargedAmount }) => {
    const orderMatch = /^ORDER-(\d+)$/.exec(providerReference || "");
    const verifyMatch = /^VERIFY-(\d+)$/.exec(providerReference || "");

    if (orderMatch) {
        return exports._handleOrderPaymentWebhook(Number(orderMatch[1]), success, transactionReference, chargedCurrency, chargedAmount);
    }

    if (verifyMatch) {
        return exports._handleVerificationFeeWebhook(Number(verifyMatch[1]), success, transactionReference, chargedCurrency, chargedAmount);
    }

    throw new Error(`Unrecognized payment reference: ${providerReference}`);
};

exports._handleOrderPaymentWebhook = async (orderId, success, transactionReference, chargedCurrency = null, chargedAmount = null) => {
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
        auditService.log({
            eventType: "payment_processed",
            description: `Payment failed for order #${orderId}`,
            metadata: { orderId, success: false, transactionReference }
        });
        return { orderId, success: false };
    }

    const receiptNumber = generateReceiptNumber();

    await paymentRepository.markCompleted(payment.id, transactionReference, receiptNumber, chargedCurrency, chargedAmount);
    await orderRepository.updatePaymentStatus(orderId, "paid");

    // A multi-vendor cart is paid for once, on the parent order - but each
    // vendor child order has its own order_items (for wallet crediting)
    // and is what sellers/agents actually read payment_status off, so both
    // need to reflect "paid" too.
    const order = await orderRepository.findOrderById(orderId);

    if (order && order.is_parent) {
        const children = await orderRepository.findChildOrders(orderId);

        await orderRepository.updatePaymentStatusForChildren(orderId, "paid");

        for (const child of children) {
            walletService.creditSellersForOrder(child.id).catch((err) =>
                console.error("Seller wallet credit error:", err)
            );
        }
    } else {
        walletService.creditSellersForOrder(orderId).catch((err) =>
            console.error("Seller wallet credit error:", err)
        );
    }

    require("../../socket/socket").emitToAdmins("admin:stats_changed", { reason: "payment_confirmed" });

    auditService.log({
        eventType: "payment_processed",
        description: `Payment completed for order #${orderId}`,
        metadata: { orderId, success: true, transactionReference, receiptNumber, chargedCurrency, chargedAmount }
    });

    return { orderId, success: true, receiptNumber };
};

exports._handleVerificationFeeWebhook = async (sellerId, success, transactionReference, chargedCurrency = null, chargedAmount = null) => {
    const payment = await paymentRepository.findPendingVerificationFeePayment(sellerId);

    if (!payment) {
        // Already processed (or never initiated) - no-op, same reasoning
        // as the order-payment path above.
        return { alreadyProcessed: true };
    }

    if (!success) {
        await paymentRepository.markFailed(payment.id);
        return { sellerId, success: false };
    }

    const receiptNumber = generateReceiptNumber();
    await paymentRepository.markCompleted(payment.id, transactionReference, receiptNumber, chargedCurrency, chargedAmount);

    // Lazy require to avoid a circular dependency (seller.service also
    // calls into payment.service to initiate the fee payment) - same
    // pattern chat.service uses for the socket layer.
    const sellerService = require("../seller/seller.service");
    await sellerService.confirmVerificationFeePaid(sellerId, payment.amount, transactionReference);

    return { sellerId, success: true, receiptNumber };
};

// --- Snippe (card payments) --------------------------------------------
// Used for both order checkout and the seller verification fee. Amounts
// are sent to Snippe as decimal TZS, so no currency conversion is needed
// (contrast with PayPal below).

exports.initiateSnippeOrderPayment = async (orderId, buyerId, { successUrl, cancelUrl }) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order || order.buyer_id !== buyerId) {
        throw new Error("Order not found");
    }

    if (order.payment_method !== "snippe") {
        throw new Error("This order is not set up for Snippe payment");
    }

    if (order.payment_status === "paid") {
        throw new Error("This order has already been paid");
    }

    let payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) {
        const paymentId = await paymentRepository.create(orderId, "snippe", order.total_amount);
        payment = { id: paymentId };
    }

    const reference = `ORDER-${orderId}`;

    const session = await snippeProvider.createCheckoutSession({
        amountTzs: order.total_amount,
        reference,
        description: `NEXORA order #${orderId}`,
        successUrl,
        cancelUrl
    });

    await paymentRepository.markPending(payment.id, session.sessionId);

    return { status: "redirect", url: session.url };
};

exports.initiateSnippeVerificationFeePayment = async (sellerId, amount, { successUrl, cancelUrl }) => {
    const existingPending = await paymentRepository.findPendingVerificationFeePayment(sellerId);
    const paymentId = existingPending
        ? existingPending.id
        : await paymentRepository.createVerificationFeePayment(sellerId, amount, "snippe");

    const reference = `VERIFY-${sellerId}`;

    const session = await snippeProvider.createCheckoutSession({
        amountTzs: amount,
        reference,
        description: "NEXORA seller verification fee",
        successUrl,
        cancelUrl
    });

    await paymentRepository.markPending(paymentId, session.sessionId);

    return { status: "redirect", url: session.url };
};

// Called from the Snippe webhook controller with an already
// signature-verified event (see snippeProvider.constructWebhookEvent).
exports.handleSnippeWebhookEvent = async (event) => {
    if (event.type !== "checkout.session.completed") {
        return { ignored: true };
    }

    const session = event.data || event.session || event;
    const reference = session.reference || session.client_reference_id;

    return exports.handleProviderWebhook({
        providerReference: reference,
        success: session.payment_status === "paid" || session.status === "completed",
        transactionReference: session.payment_id || session.id
    });
};

// --- PayPal (card / PayPal balance) -------------------------------------
// PayPal doesn't support TZS, so amounts are converted to USD first (see
// paypal.provider.js). Capture happens server-side when the frontend
// calls back after the buyer approves on PayPal's site - never trust the
// redirect alone.

exports.initiatePaypalOrderPayment = async (orderId, buyerId, { returnUrl, cancelUrl }) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order || order.buyer_id !== buyerId) {
        throw new Error("Order not found");
    }

    if (order.payment_method !== "paypal") {
        throw new Error("This order is not set up for PayPal payment");
    }

    if (order.payment_status === "paid") {
        throw new Error("This order has already been paid");
    }

    let payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) {
        const paymentId = await paymentRepository.create(orderId, "paypal", order.total_amount);
        payment = { id: paymentId };
    }

    const usdExchangeRate = await settingsService.getUsdExchangeRate();
    const reference = `ORDER-${orderId}`;

    const result = await paypalProvider.createOrder({
        amountTzs: order.total_amount,
        usdExchangeRate,
        reference,
        description: `NEXORA order #${orderId}`,
        returnUrl,
        cancelUrl
    });

    await paymentRepository.markPending(payment.id, result.paypalOrderId);

    return { status: "redirect", url: result.approveUrl, usdAmount: result.usdAmount };
};

exports.initiatePaypalVerificationFeePayment = async (sellerId, amount, { returnUrl, cancelUrl }) => {
    const existingPending = await paymentRepository.findPendingVerificationFeePayment(sellerId);
    const paymentId = existingPending
        ? existingPending.id
        : await paymentRepository.createVerificationFeePayment(sellerId, amount, "paypal");

    const usdExchangeRate = await settingsService.getUsdExchangeRate();
    const reference = `VERIFY-${sellerId}`;

    const result = await paypalProvider.createOrder({
        amountTzs: amount,
        usdExchangeRate,
        reference,
        description: "NEXORA seller verification fee",
        returnUrl,
        cancelUrl
    });

    await paymentRepository.markPending(paymentId, result.paypalOrderId);

    return { status: "redirect", url: result.approveUrl, usdAmount: result.usdAmount };
};

// Called by our own /paypal/capture endpoint once the buyer/seller is
// redirected back from PayPal's approval page (?token=<paypalOrderId>).
exports.capturePaypalPayment = async (paypalOrderId) => {
    const capture = await paypalProvider.captureOrder(paypalOrderId);

    // Prefer the reference PayPal itself echoes back; fall back to our
    // own payment row (looked up by the order id we stored at initiate
    // time) in case a given integration doesn't return reference_id.
    let reference = capture.reference;
    if (!reference) {
        const payment = await paymentRepository.findByTransactionReference(paypalOrderId);
        if (payment) {
            reference = payment.purpose === "seller_verification_fee"
                ? `VERIFY-${payment.seller_id}`
                : `ORDER-${payment.order_id}`;
        }
    }

    if (!reference) {
        throw new Error("Could not determine what this PayPal payment was for");
    }

    const payment = await paymentRepository.findByTransactionReference(paypalOrderId);
    const chargedAmount = payment ? Number((payment.amount / (await settingsService.getUsdExchangeRate())).toFixed(2)) : null;

    return exports.handleProviderWebhook({
        providerReference: reference,
        success: capture.success,
        transactionReference: capture.transactionReference,
        chargedCurrency: capture.success ? "USD" : null,
        chargedAmount: capture.success ? chargedAmount : null
    });
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