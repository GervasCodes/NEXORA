const paymentRepository = require("./payment.repository");
const orderRepository = require("../order/order.repository");
const bookingRepository = require("../booking/booking.repository");
const mobileMoneyProvider = require("./providers/mobileMoney.provider");
const snippeProvider = require("./providers/snippe.provider");
const paypalProvider = require("./providers/paypal.provider");
const providerRegistry = require("./providers/registry");
const walletService = require("../wallet/wallet.service");
const settingsService = require("../settings/settings.service");
const auditService = require("../audit/audit.service");
const logger = require("../../utils/logger").child({ module: "payment-webhook" });
const Sentry = require("../../config/sentry");

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

// ---- Subscription payments (Revenue & Product Enhancements) ---------------
// Follows initiateVerificationFeePayment's shape exactly - a
// subscription_id (not an order_id/booking_id) identifies what's being
// paid for, and the SUB-<subscriptionId> reference routes the webhook
// back here (see handleProviderWebhook below).

exports.initiateMobileMoneySubscriptionPayment = async (sellerId, planId, phone) => {
    const subscriptionRepository = require("../subscription/subscription.repository");
    const plan = await subscriptionRepository.findPlanById(planId);
    if (!plan) throw new Error("Plan not found");

    let subscription = await subscriptionRepository.findPendingForSeller(sellerId, planId);
    const subscriptionId = subscription
        ? subscription.id
        : await subscriptionRepository.createSubscription(sellerId, planId);

    const paymentId = await paymentRepository.createSubscriptionPayment(sellerId, subscriptionId, plan.price, "mobile_money");

    const reference = `SUB-${subscriptionId}`;

    let providerResult;
    try {
        providerResult = await mobileMoneyProvider.initiate(phone, plan.price, {
            reference,
            purpose: "seller_subscription",
            description: `NEXORA ${plan.name} subscription`
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
        message: "Check your phone to complete the payment. Your plan will activate automatically once payment is confirmed.",
        transactionReference: providerResult.transactionReference
    };
};

exports.initiateSnippeSubscriptionPayment = async (sellerId, planId, { successUrl, cancelUrl }) => {
    const subscriptionRepository = require("../subscription/subscription.repository");
    const plan = await subscriptionRepository.findPlanById(planId);
    if (!plan) throw new Error("Plan not found");

    let subscription = await subscriptionRepository.findPendingForSeller(sellerId, planId);
    const subscriptionId = subscription
        ? subscription.id
        : await subscriptionRepository.createSubscription(sellerId, planId);

    const paymentId = await paymentRepository.createSubscriptionPayment(sellerId, subscriptionId, plan.price, "snippe");

    const reference = `SUB-${subscriptionId}`;

    const session = await snippeProvider.createCheckoutSession({
        amountTzs: plan.price,
        reference,
        description: `NEXORA ${plan.name} subscription`,
        successUrl,
        cancelUrl
    });

    await paymentRepository.markPending(paymentId, session.sessionId);

    return { status: "redirect", url: session.url };
};

exports.initiatePaypalSubscriptionPayment = async (sellerId, planId, { returnUrl, cancelUrl }) => {
    const subscriptionRepository = require("../subscription/subscription.repository");
    const plan = await subscriptionRepository.findPlanById(planId);
    if (!plan) throw new Error("Plan not found");

    let subscription = await subscriptionRepository.findPendingForSeller(sellerId, planId);
    const subscriptionId = subscription
        ? subscription.id
        : await subscriptionRepository.createSubscription(sellerId, planId);

    const paymentId = await paymentRepository.createSubscriptionPayment(sellerId, subscriptionId, plan.price, "paypal");

    const usdExchangeRate = await settingsService.getUsdExchangeRate();
    const reference = `SUB-${subscriptionId}`;

    const result = await paypalProvider.createOrder({
        amountTzs: plan.price,
        usdExchangeRate,
        reference,
        description: `NEXORA ${plan.name} subscription`,
        returnUrl,
        cancelUrl
    });

    await paymentRepository.markPending(paymentId, result.paypalOrderId);

    return { status: "redirect", url: result.approveUrl, usdAmount: result.usdAmount };
};

exports._handleSubscriptionPaymentWebhook = async (subscriptionId, success, transactionReference, chargedCurrency = null, chargedAmount = null) => {
    const payment = await paymentRepository.findPendingSubscriptionPayment(subscriptionId);

    if (!payment) {
        return { alreadyProcessed: true };
    }

    if (!success) {
        await paymentRepository.markFailed(payment.id);
        return { subscriptionId, success: false };
    }

    const receiptNumber = generateReceiptNumber();
    await paymentRepository.markCompleted(payment.id, transactionReference, receiptNumber, chargedCurrency, chargedAmount);

    const subscriptionService = require("../subscription/subscription.service");
    await subscriptionService.activateSubscription(subscriptionId);

    return { subscriptionId, success: true, receiptNumber };
};

// ---- Booking payments (Phase 3 - Financial Integration) --------------------
// Follow initiateVerificationFeePayment's shape, not the order-payment
// functions' - see migration 064's design notes: a booking has no
// predetermined payment_method column to validate against (unlike
// orders.payment_method, chosen once at checkout), so any of these three
// can be called for the same booking until one actually succeeds.

exports.initiateMobileMoneyBookingPayment = async (bookingId, buyerId, phone) => {
    const booking = await bookingRepository.findById(bookingId);

    if (!booking || booking.customer_id !== buyerId) {
        throw new Error("Booking not found");
    }

    if (booking.payment_status === "paid") {
        throw new Error("This booking has already been paid");
    }

    if (!phone) {
        throw new Error("A phone number is required to pay by mobile money");
    }

    const existingPending = await paymentRepository.findPendingBookingPayment(bookingId);
    const paymentId = existingPending
        ? existingPending.id
        : await paymentRepository.createBookingPayment(bookingId, booking.amount, "mobile_money");

    const reference = `BOOKING-${bookingId}`;

    let providerResult;
    try {
        providerResult = await mobileMoneyProvider.initiate(phone, booking.amount, {
            reference,
            description: `NEXORA booking ${booking.booking_reference}`
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
        message: "Check your phone to complete the payment.",
        transactionReference: providerResult.transactionReference
    };
};

exports.initiateSnippeBookingPayment = async (bookingId, buyerId, { successUrl, cancelUrl }) => {
    const booking = await bookingRepository.findById(bookingId);

    if (!booking || booking.customer_id !== buyerId) {
        throw new Error("Booking not found");
    }

    if (booking.payment_status === "paid") {
        throw new Error("This booking has already been paid");
    }

    const existingPending = await paymentRepository.findPendingBookingPayment(bookingId);
    const paymentId = existingPending
        ? existingPending.id
        : await paymentRepository.createBookingPayment(bookingId, booking.amount, "snippe");

    const reference = `BOOKING-${bookingId}`;

    const session = await snippeProvider.createCheckoutSession({
        amountTzs: booking.amount,
        reference,
        description: `NEXORA booking ${booking.booking_reference}`,
        successUrl,
        cancelUrl
    });

    await paymentRepository.markPending(paymentId, session.sessionId);

    return { status: "redirect", url: session.url };
};

exports.initiatePaypalBookingPayment = async (bookingId, buyerId, { returnUrl, cancelUrl }) => {
    const booking = await bookingRepository.findById(bookingId);

    if (!booking || booking.customer_id !== buyerId) {
        throw new Error("Booking not found");
    }

    if (booking.payment_status === "paid") {
        throw new Error("This booking has already been paid");
    }

    const existingPending = await paymentRepository.findPendingBookingPayment(bookingId);
    const paymentId = existingPending
        ? existingPending.id
        : await paymentRepository.createBookingPayment(bookingId, booking.amount, "paypal");

    const usdExchangeRate = await settingsService.getUsdExchangeRate();
    const reference = `BOOKING-${bookingId}`;

    const result = await paypalProvider.createOrder({
        amountTzs: booking.amount,
        usdExchangeRate,
        reference,
        description: `NEXORA booking ${booking.booking_reference}`,
        returnUrl,
        cancelUrl
    });

    await paymentRepository.markPending(paymentId, result.paypalOrderId);

    return { status: "redirect", url: result.approveUrl, usdAmount: result.usdAmount };
};

exports.getBookingPayment = async (bookingId, userId) => {
    const booking = await bookingRepository.findById(bookingId);

    if (!booking || (booking.customer_id !== userId && booking.provider_id !== userId)) {
        throw new Error("Booking not found");
    }

    const payment = await paymentRepository.findByBookingId(bookingId);

    if (!payment) {
        throw new Error("No payment record for this booking yet");
    }

    return payment;
};

// Called by payment.controller's webhook handlers once MalipoPay/Selcom/
// Snippe confirm the buyer/seller actually completed (or failed/cancelled)
// the payment on their end, or by the PayPal capture flow once we've
// confirmed a capture server-side. `providerReference` is the reference WE
// sent when initiating the payment: "ORDER-42" for order payments,
// "VERIFY-7" for a seller's verification fee, "BOOKING-15" for a booking
// payment (Phase 3) - see the `reference` values above/in the order
// functions further down. `chargedCurrency`/`chargedAmount` are only
// passed for foreign-currency gateways (PayPal) - see migration 028.
exports.handleProviderWebhook = async ({ providerReference, success, transactionReference, chargedCurrency, chargedAmount }) => {
    const orderMatch = /^ORDER-(\d+)$/.exec(providerReference || "");
    const verifyMatch = /^VERIFY-(\d+)$/.exec(providerReference || "");
    const bookingMatch = /^BOOKING-(\d+)$/.exec(providerReference || "");
    const subscriptionMatch = /^SUB-(\d+)$/.exec(providerReference || "");

    if (orderMatch) {
        return exports._handleOrderPaymentWebhook(Number(orderMatch[1]), success, transactionReference, chargedCurrency, chargedAmount);
    }

    if (verifyMatch) {
        return exports._handleVerificationFeeWebhook(Number(verifyMatch[1]), success, transactionReference, chargedCurrency, chargedAmount);
    }

    if (bookingMatch) {
        return exports._handleBookingPaymentWebhook(Number(bookingMatch[1]), success, transactionReference, chargedCurrency, chargedAmount);
    }

    if (subscriptionMatch) {
        return exports._handleSubscriptionPaymentWebhook(Number(subscriptionMatch[1]), success, transactionReference, chargedCurrency, chargedAmount);
    }

    throw new Error(`Unrecognized payment reference: ${providerReference}`);
};

// The booking equivalent of _handleOrderPaymentWebhook below - much
// simpler since a booking has exactly one provider (no parent/child
// split to propagate payment_status across - see 063's design notes) and
// always goes through escrow (no Cash-on-Delivery-shaped path for a
// service - see walletService.creditProvidersForBooking).
exports._handleBookingPaymentWebhook = async (bookingId, success, transactionReference, chargedCurrency = null, chargedAmount = null) => {
    const payment = await paymentRepository.findByBookingId(bookingId);

    if (!payment) {
        throw new Error(`No payment record found for booking #${bookingId}`);
    }

    if (payment.status === "completed" || payment.status === "failed") {
        return { alreadyProcessed: true };
    }

    if (!success) {
        await paymentRepository.markFailed(payment.id);
        auditService.log({
            eventType: "payment_processed",
            description: `Payment failed for booking #${bookingId}`,
            metadata: { bookingId, success: false, transactionReference }
        });
        return { bookingId, success: false };
    }

    const receiptNumber = generateReceiptNumber();

    await paymentRepository.markCompleted(payment.id, transactionReference, receiptNumber, chargedCurrency, chargedAmount);
    await bookingRepository.updatePaymentStatus(bookingId, "paid");

    const booking = await bookingRepository.findById(bookingId);

    walletService.creditProvidersForBooking(bookingId).catch((err) => {
        // This is the critical case: the buyer's payment already
        // succeeded (we're past that point above) but crediting the
        // provider's wallet failed - money is "stuck" in escrow state
        // until this is manually reconciled, so it's reported to
        // Sentry as an error, not just logged.
        logger.error({ err, bookingId }, "Provider wallet credit error");
        Sentry.captureException(err, { tags: { area: "payment-webhook", stage: "wallet-credit" }, extra: { bookingId } });
    });

    if (booking) {
        const notificationService = require("../notification/notification.service");

        notificationService.notify({
            userId: booking.customer_id,
            type: "booking_payment",
            title: "Payment received",
            message: `Your payment for booking ${booking.booking_reference} was received.`,
            url: `/bookings/${bookingId}`
        }).catch((err) => logger.warn({ err, bookingId, userId: booking.customer_id }, "booking payment notify error"));

        notificationService.notify({
            userId: booking.provider_id,
            type: "booking_payment",
            title: "Payment received",
            message: `Payment for booking ${booking.booking_reference} has been received and is held in escrow.`,
            url: `/seller/bookings/${bookingId}`
        }).catch((err) => logger.warn({ err, bookingId, userId: booking.provider_id }, "booking payment notify error"));

        const socketModule = require("../../socket/socket");
        socketModule.emitToUser(booking.customer_id, "payment:updated", {
            bookingId, success: true, paymentStatus: "paid", receiptNumber
        });
    }

    auditService.log({
        eventType: "payment_processed",
        description: `Payment completed for booking #${bookingId}`,
        metadata: { bookingId, success: true, transactionReference, receiptNumber, chargedCurrency, chargedAmount }
    });

    return { bookingId, success: true, receiptNumber };
};

// Best-effort online refund for a paid booking that's being cancelled
// (booking.service.js#cancelBooking) - not tied to a dispute row, unlike
// refund.service.js's dispute-triggered refunds (there is no dispute
// system for bookings - see migration 064's design notes), so this calls
// the same provider refund APIs refund.service.js's callProvider already
// wraps, directly, without the retry/audit/refunds-table machinery built
// around the disputes flow. Fire-and-forget from the caller's point of
// view is NOT appropriate here (the booking's own status/refund outcome
// depends on this), so this is awaited and its result returned as-is.
exports.refundBookingPayment = async (bookingId, amount) => {
    const payment = await paymentRepository.findByBookingId(bookingId);

    if (!payment || payment.status !== "completed") {
        return { success: false, error: "No completed payment found for this booking" };
    }

    if (payment.method === "mobile_money") {
        const booking = await bookingRepository.findById(bookingId);
        // Bookings don't carry a phone column of their own (see 063) - the
        // buyer's phone was only ever collected transiently, at the moment
        // they called initiateMobileMoneyBookingPayment, and isn't
        // persisted anywhere this refund path can read it back from.
        return { success: false, error: "Mobile money booking refunds need the buyer's phone number - please process this refund manually", requiresManualHandling: true, booking };
    }

    if (payment.method === "snippe") {
        if (!payment.transaction_reference) {
            return { success: false, error: "Payment has no Snippe transaction reference on file" };
        }
        const result = await snippeProvider.refundPayment({
            transactionReference: payment.transaction_reference,
            amountTzs: amount,
            reason: `booking_${bookingId}_cancelled`
        });
        return { success: Boolean(result.success), reference: result.refundReference, error: result.error };
    }

    if (payment.method === "paypal") {
        if (!payment.transaction_reference) {
            return { success: false, error: "Payment has no PayPal capture id on file" };
        }
        const isFullRefund = Number(amount) >= Number(payment.amount);
        const amountUsd = isFullRefund || !payment.charged_amount
            ? null
            : Number(((Number(amount) / Number(payment.amount)) * Number(payment.charged_amount)).toFixed(2));

        const result = await paypalProvider.refundCapture(payment.transaction_reference, amountUsd);
        return { success: Boolean(result.success), reference: result.refundReference, error: result.error };
    }

    return { success: false, error: `No automatic refund path for payment method "${payment.method}"` };
};

exports._handleOrderPaymentWebhook = async (orderId, success, transactionReference, chargedCurrency = null, chargedAmount = null) => {
    const payment = await paymentRepository.findByOrderId(orderId);

    if (!payment) {
        throw new Error(`No payment record found for order #${orderId}`);
    }

    // Fetched up front (not just on the success path) so both branches can
    // push a live "payment:updated" event to the buyer's open order page -
    // see socket.emitToUser calls below. The buyer's browser only knows a
    // provider redirect/webhook happened, not whether it actually
    // succeeded, so it can't safely show a result until this event (or a
    // fresh GET /orders/:id) confirms it.
    const orderForNotify = await orderRepository.findOrderById(orderId);

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
        if (orderForNotify) {
            require("../../socket/socket").emitToUser(orderForNotify.buyer_id, "payment:updated", {
                orderId, success: false, paymentStatus: "unpaid"
            });
        }
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
            walletService.creditSellersForOrder(child.id).catch((err) => {
                logger.error({ err, orderId: child.id, parentOrderId: orderId }, "Seller wallet credit error");
                Sentry.captureException(err, { tags: { area: "payment-webhook", stage: "wallet-credit" }, extra: { orderId: child.id, parentOrderId: orderId } });
            });
        }
    } else {
        walletService.creditSellersForOrder(orderId).catch((err) => {
            logger.error({ err, orderId }, "Seller wallet credit error");
            Sentry.captureException(err, { tags: { area: "payment-webhook", stage: "wallet-credit" }, extra: { orderId } });
        });
    }

    const socketModule = require("../../socket/socket");
    socketModule.emitToAdmins("admin:stats_changed", { reason: "payment_confirmed" });

    if (orderForNotify) {
        // Notify the buyer's own room too - Snippe/mobile-money redirects
        // and USSD prompts only mean "the buyer tried to pay", not "it
        // succeeded"; this is the actual confirmation the order page waits
        // on before showing anything as successful. For a parent order,
        // the buyer paid on the parent, so notify against the parent id
        // (child order ids are internal and never shown to the buyer).
        socketModule.emitToUser(orderForNotify.buyer_id, "payment:updated", {
            orderId, success: true, paymentStatus: "paid", receiptNumber
        });
    }

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
            if (payment.purpose === "seller_verification_fee") {
                reference = `VERIFY-${payment.seller_id}`;
            } else if (payment.purpose === "booking_payment") {
                reference = `BOOKING-${payment.booking_id}`;
            } else {
                reference = `ORDER-${payment.order_id}`;
            }
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

// Phase 5 (Resilience & Growth). Purely additive - reads the registry's
// capability metadata, doesn't touch any existing payment flow. Lets
// checkout show only rails an admin has actually configured, instead of
// hardcoding "mobile money, Snippe, PayPal" and finding out one of them
// 401s when a buyer tries it.
exports.getAvailablePaymentMethods = () => providerRegistry.listConfiguredProviders();

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

// Buyer confirms they actually received the order (migration 061). This
// replaces the old seller-self-reported confirmCashOnDelivery: a seller
// claiming "I got paid" was never actually proof of anything - the buyer
// confirming is. Works for every payment method (records buyer_confirmed_at
// either way), but only has a payment side effect for Cash on Delivery,
// where confirming receipt IS confirming the cash was actually handed over.
exports.confirmDeliveryReceipt = async (orderId, buyerId) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order || order.buyer_id !== buyerId) {
        throw new Error("Order not found");
    }

    if (order.status !== "delivered") {
        throw new Error("You can only confirm receipt after the order has been marked delivered");
    }

    if (order.buyer_confirmed_at) {
        throw new Error("You've already confirmed receipt for this order");
    }

    if (order.payment_method !== "cash_on_delivery") {
        await orderRepository.markBuyerConfirmed(orderId);
        return { confirmed: true, paymentConfirmed: false };
    }

    // Cash on Delivery: only a seller's own roster agent should ever be
    // handling cash (see order.service.js#updateOrderStatusBySeller,
    // which blocks shipping a COD order through the open platform pool in
    // the first place). This is a defensive re-check, not the primary
    // gate - it protects orders that predate that guard, or any other
    // path that could set delivery_mode.
    if (order.delivery_mode !== "own") {
        throw new Error("Cash on Delivery collection is only available for orders delivered by the seller's own delivery agent. Please contact support.");
    }

    await orderRepository.markBuyerConfirmed(orderId);

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

    walletService.creditSellersForOrder(orderId).catch((err) => {
        logger.error({ err, orderId }, "Seller wallet credit error");
        Sentry.captureException(err, { tags: { area: "payment", stage: "wallet-credit" }, extra: { orderId } });
    });

    return { confirmed: true, paymentConfirmed: true, receiptNumber };
};