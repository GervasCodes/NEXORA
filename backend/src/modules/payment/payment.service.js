const subscriptionPaymentGuard = require("./subscriptionPaymentGuard");
const paymentRepository = require("./payment.repository");
const orderRepository = require("../order/order.repository");
const bookingRepository = require("../booking/booking.repository");
const mobileMoneyProvider = require("./providers/mobileMoney.provider");
const snippeProvider = require("./providers/snippe.provider");
const malipopayCardProvider = require("./providers/malipopayCard.provider");
const paypalProvider = require("./providers/paypal.provider");
const providerRegistry = require("./providers/registry");
const walletService = require("../wallet/wallet.service");
const settingsService = require("../settings/settings.service");
const auditService = require("../audit/audit.service");
const logger = require("../../utils/logger").child({ module: "payment-webhook" });
const Sentry = require("../../config/sentry");
const paymentReference = require("./paymentReference");
const providerStatus = require("./providerStatus");
const paymentReviewService = require("./paymentReview.service");

const { REASONS } = paymentReviewService;

// Errors a retry can never fix (unrecognised reference, no payment row for
// it). Webhook controllers answer these with a 2xx so the provider stops
// retrying; anything else is treated as transient and answered with a 5xx
// so the provider redelivers.
const permanentError = (message) => Object.assign(new Error(message), { permanent: true });
exports.permanentError = permanentError;

const generateReceiptNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `RCPT-${timestamp}-${random}`;
};

// Pre-order / made-to-order (Phase 8) - what a checkout/payment attempt
// against this order should actually charge right now. A standard order
// (or a pre-order that's already fully paid, though every initiate*
// function below already blocks that separately) just charges the full
// total, unchanged from before this feature existed. A pre-order still
// sitting at "unpaid" owes its deposit; one already at "deposit_paid"
// owes the remaining balance.
const resolveChargeAmount = (order) => {
    if (order.order_type === "pre_order") {
        if (order.payment_status === "deposit_paid") {
            return order.balance_amount;
        }
        return order.deposit_amount;
    }
    return order.total_amount;
};

const resolvePaymentLeg = (order) => {
    if (order.order_type !== "pre_order") return "full";
    return order.payment_status === "deposit_paid" ? "balance" : "deposit";
};

// Every payment ATTEMPT gets its own payment row and its own unique opaque
// reference (see paymentReference.js). The old code reused one row (and one
// ORDER-<id> reference) for every retry, so a late callback from attempt 1
// could be applied to attempt 2. Now a callback only ever matches the row
// whose reference it carries.
//
// A second attempt started within a minute of a still-pending one is
// refused: the buyer already has a prompt on their phone, and a second one
// would just invite a double payment. Checked in SQL (created_at vs NOW())
// so it does not depend on the app server's clock matching the database's.
const assertNoRecentPendingAttempt = async (target) => {
    if (await paymentRepository.hasRecentPending(target)) {
        throw new Error("A payment was just started for this. Check your phone, or wait a minute before trying again");
    }
};

const getOrCreateOrderPayment = async (order, method) => {
    await assertNoRecentPendingAttempt({ orderId: order.id });

    const reference = paymentReference.build("order", order.id);
    const paymentId = await paymentRepository.create(
        order.id,
        method,
        resolveChargeAmount(order),
        resolvePaymentLeg(order),
        reference
    );

    return { id: paymentId, payment_reference: reference };
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

    if (order.status === "cancelled") {
        throw new Error("This order has been cancelled and can no longer be paid");
    }

    const payment = await getOrCreateOrderPayment(order, "mobile_money");
    const chargeAmount = resolveChargeAmount(order);

    // This reference ties the provider's webhook back to this exact
    // payment attempt when the buyer confirms on their phone - a separate,
    // later HTTP call from the provider's servers.
    const reference = payment.payment_reference;

    let providerResult;
    try {
        providerResult = await mobileMoneyProvider.initiate(
            order.shipping_phone,
            chargeAmount,
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

// ---- Wallet top-up & wallet-funded order payment (Phase Q2) -------------
// initiateWalletTopUp mirrors initiateMobileMoneyPayment's shape -
// mobile money is the only way to fund the wallet (you can't top up the
// wallet from the wallet). initiateWalletOrderPayment is different: a
// wallet-funded order never touches an external provider at all, so it's
// synchronous and has no webhook/pending state to wait for.

// Top-up limits (Phase 2, P1): a plain amount>0 check used to be the only
// guard here. Now: min/max, a per-day cap that scales with the buyer's
// KYC tier (same tier used for order-value limits - see kyc.service.js),
// and real phone validation - reusing the buyer's shipping phone was
// never even possible here (a top-up has no order), but the phone typed
// in is now checked and remembered as `last_topup_phone` so the top-up
// form can default to it next time instead of the buyer retyping it.
exports.initiateWalletTopUp = async (buyerId, phone, amount) => {
    if (!amount || Number(amount) <= 0) {
        throw new Error("Invalid top-up amount");
    }

    const phoneNumber = require("../../utils/phoneNumber");
    if (!phoneNumber.isValidPhone(phone)) {
        throw new Error("Please enter a valid phone number for this top-up");
    }
    const normalizedPhone = phoneNumber.normalizePhone(phone);

    const settingsLimits = await settingsService.getTopUpLimits();
    if (Number(amount) < settingsLimits.minAmount) {
        throw new Error(`The minimum top-up amount is ${settingsLimits.minAmount}`);
    }
    if (Number(amount) > settingsLimits.maxAmount) {
        throw new Error(`The maximum top-up amount is ${settingsLimits.maxAmount}`);
    }

    const buyerWalletRepository = require("../buyerWallet/buyerWallet.repository");
    const kycRepository = require("../kyc/kyc.repository");
    const tier = (await kycRepository.getUserTier(buyerId)) || "tier0";
    const dailyCap = settingsLimits.dailyCapByTier[tier] ?? settingsLimits.dailyCapByTier.tier0;
    const toppedUpToday = await buyerWalletRepository.sumCompletedTopUpsToday(buyerId);
    if (toppedUpToday + Number(amount) > dailyCap) {
        throw new Error(`This would take today's top-ups over your account's daily limit of ${dailyCap}. Try a smaller amount, or verify your identity to raise your limit.`);
    }

    const topupId = await buyerWalletRepository.createTopUp(buyerId, amount);
    const reference = paymentReference.build("topup", topupId);
    const paymentId = await paymentRepository.createTopUpPayment(buyerId, topupId, amount, reference);

    let providerResult;
    try {
        providerResult = await mobileMoneyProvider.initiate(normalizedPhone, amount, {
            reference,
            purpose: "wallet_topup",
            description: "NEXORA wallet top-up"
        });
    } catch (error) {
        await paymentRepository.markFailed(paymentId);
        await buyerWalletRepository.markTopUpFailed(topupId);
        throw error;
    }

    if (!providerResult.success) {
        await paymentRepository.markFailed(paymentId);
        await buyerWalletRepository.markTopUpFailed(topupId);
        throw new Error("Top-up could not be initiated. Please try again");
    }

    await paymentRepository.markPending(paymentId, providerResult.transactionReference);
    await buyerWalletRepository.updateLastTopupPhone(buyerId, normalizedPhone);

    return {
        status: "pending",
        message: "Check your phone to complete the top-up.",
        transactionReference: providerResult.transactionReference
    };
};

// ---- Shared webhook plumbing ---------------------------------------------
// Everything below is used by all four handlers (order / booking /
// subscription / top-up). The rules they share:
//   * a completed (or charged-back) payment is never touched again;
//   * a success on a payment we had already marked FAILED is a real payment
//     (the provider's answer arrived after we gave up) - it is applied, or
//     flagged for a human, never dropped as "already processed";
//   * a failure only ever moves a PENDING payment to failed;
//   * the payment is claimed with one conditional UPDATE, so two concurrent
//     deliveries cannot both apply it.

// The reference we sent the provider for a payment row. Rows created before
// per-attempt references shipped only have the old ORDER-<id> style.
const referenceForPayment = (payment) => {
    if (payment.payment_reference) return payment.payment_reference;
    if (payment.purpose === "booking_payment") return `BOOKING-${payment.booking_id}`;
    if (payment.purpose === "subscription_payment") return `SUB-${payment.subscription_id}`;
    if (payment.purpose === "wallet_topup") return `TOPUP-${payment.topup_id}`;
    return `ORDER-${payment.order_id}`;
};
exports.referenceForPayment = referenceForPayment;

// The payment row a callback is about: an explicitly supplied row (the
// stale sweep / admin accept already hold it), else the one whose unique
// per-attempt reference the callback carries, else - old in-flight
// references only - the latest row for that id.
const resolvePayment = async (options, legacyLookup) => {
    if (options.payment) return options.payment;
    if (options.paymentReference) return paymentRepository.findByPaymentReference(options.paymentReference);
    return legacyLookup();
};

// Compares what the provider says it charged with what this payment row
// expected. Only runs when the provider actually reported an amount.
// Returns null when fine (or nothing to compare), else the mismatch.
const checkReportedAmount = (payment, options) => {
    if (options.skipAmountCheck) return null;
    if (options.reportedAmount === undefined || options.reportedAmount === null) return null;

    const reportedCurrency = options.reportedCurrency ? String(options.reportedCurrency).toUpperCase() : null;

    if (payment.method === "paypal") {
        if (payment.expected_usd_amount === null || payment.expected_usd_amount === undefined) return null;
        const currencyOk = !reportedCurrency || reportedCurrency === "USD";
        if (currencyOk && providerStatus.usdAmountsMatch(payment.expected_usd_amount, options.reportedAmount)) return null;
        return { expected: Number(payment.expected_usd_amount), reported: Number(options.reportedAmount), currency: reportedCurrency || "USD" };
    }

    const currencyOk = !reportedCurrency || reportedCurrency === "TZS";
    if (currencyOk && providerStatus.amountsMatch(payment.amount, options.reportedAmount)) return null;
    return { expected: Number(payment.amount), reported: Number(options.reportedAmount), currency: reportedCurrency || "TZS" };
};

const flagAmountMismatch = (payment, mismatch, extra = {}) =>
    paymentReviewService.flag({
        payment,
        reason: REASONS.AMOUNT_MISMATCH,
        severity: "critical",
        details: { ...mismatch, ...extra }
    });

const noteLateSuccess = (payment, extra = {}) => {
    logger.warn({ paymentId: payment.id, purpose: payment.purpose, ...extra }, "success callback on a payment already marked failed - treating it as a real payment");
    auditService.log({
        eventType: "payment_late_success",
        description: `Success received for payment #${payment.id} after it was marked failed`,
        metadata: { paymentId: payment.id, purpose: payment.purpose, ...extra }
    });
};

// The money is confirmed and recorded, but applying it (crediting a wallet,
// activating a plan) failed. Never swallowed: Sentry + an admin review item.
const flagApplyFailure = async (payment, error, extra = {}) => {
    logger.error({ err: error, paymentId: payment.id, ...extra }, "payment confirmed but applying it failed");
    Sentry.captureException(error, {
        tags: { area: "payment-webhook", stage: "apply" },
        extra: { paymentId: payment.id, ...extra }
    });
    await paymentReviewService.flag({
        payment,
        reason: REASONS.APPLY_FAILED,
        severity: "critical",
        details: { error: error.message, ...extra }
    });
};

// Fire-and-forget seller/provider credit after a confirmed payment. It must
// not fail the webhook (the buyer's payment already succeeded), but a
// failure is reported to Sentry AND put in the admin queue so the
// "money is stuck" case cannot go unnoticed.
const runCreditInBackground = (payment, label, creditPromise, extra) => {
    Promise.resolve(creditPromise).catch((err) => {
        logger.error({ err, ...extra }, `${label} error`);
        Sentry.captureException(err, { tags: { area: "payment-webhook", stage: "wallet-credit" }, extra });
        paymentReviewService.flag({
            payment,
            reason: REASONS.APPLY_FAILED,
            severity: "critical",
            details: { stage: "wallet-credit", error: err.message, ...extra }
        });
    });
};

// ---- Wallet top-up webhook ----------------------------------------------
// Wallet top-up atomic (Phase 2, P0): claiming the payment, marking the
// top-up completed and crediting the wallet now happen in ONE database
// transaction. If crediting fails for any reason, the claim rolls back
// with it - the payment row stays pending/failed exactly as it was, so a
// provider redelivery (or the reconciliation job) retries the whole thing
// from scratch. That is strictly better than the old "claim first, credit
// after" split: a credit failure there left the payment stuck at
// 'completed' forever, so the NEXT delivery of the same webhook saw
// `alreadyProcessed: true` and the top-up was never credited at all - the
// exact "money confirmed but never applied, and now unrecoverable" bug
// this phase exists to close.
exports._handleWalletTopupWebhook = async (topupId, success, transactionReference, chargedCurrency = null, chargedAmount = null, options = {}) => {
    const buyerWalletRepository = require("../buyerWallet/buyerWallet.repository");
    const buyerWalletService = require("../buyerWallet/buyerWallet.service");
    const db = require("../../config/db");

    const payment = await resolvePayment(options, () => paymentRepository.findLatestByTopUpId(topupId));
    if (!payment) {
        throw permanentError(`No payment record found for wallet top-up #${topupId}`);
    }

    if (payment.status === "completed" || payment.status === "chargeback") {
        return { alreadyProcessed: true };
    }

    if (!success) {
        if (payment.status === "failed") return { alreadyProcessed: true };
        if (!(await paymentRepository.markFailed(payment.id))) return { alreadyProcessed: true };
        await buyerWalletRepository.markTopUpFailed(topupId);
        return { topupId, success: false };
    }

    const mismatch = checkReportedAmount(payment, options);
    if (mismatch) {
        await flagAmountMismatch(payment, mismatch, { topupId });
        return { topupId, success: false, needsReview: true };
    }

    const receiptNumber = generateReceiptNumber();
    const wasFailed = payment.status === "failed";

    const connection = await db.getConnection();
    let claimed = false;
    try {
        await connection.beginTransaction();

        claimed = await paymentRepository.claimCompleted(
            payment.id, transactionReference, receiptNumber, chargedCurrency, chargedAmount, connection
        );
        if (!claimed) {
            await connection.rollback();
            connection.release();
            return { alreadyProcessed: true };
        }

        await buyerWalletRepository.markTopUpCompleted(topupId, connection);
        await buyerWalletService.creditFromTopUp(payment.seller_id, payment.amount, topupId, connection);

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        connection.release();
        // Not swallowed even though it rolled back cleanly: something is
        // stopping this top-up from ever completing (a schema issue, a
        // consistently-failing query), which deserves admin visibility
        // even though no money actually moved on this attempt.
        await flagApplyFailure(payment, error, { topupId });
        throw error;
    }
    connection.release();

    if (wasFailed) noteLateSuccess(payment, { topupId });

    return { topupId, success: true, receiptNumber };
};

// Called from order.service.js#checkout (or a "pay with wallet" retry on
// an existing pending order) when the buyer picked "wallet" as their
// payment method. Debits the buyer's balance and marks the payment/order
// paid in the same call - there's no external gateway round trip to
// wait for, so unlike every other initiate*Payment above this either
// fully succeeds or throws, with nothing left "pending".
//
// Wallet order payment atomic (Phase 2, P0): checking the order is still
// payable, debiting the wallet, claiming the payment and marking the
// order (and its children, and pre-order legs) paid ALL happen inside one
// transaction that holds a row lock on the order for its entire
// duration - a second concurrent wallet-payment attempt for the same
// order blocks on that lock instead of racing the debit, and if anything
// in the sequence fails the debit rolls back with it (the buyer is never
// charged for a payment that didn't actually go through). This is its own
// self-contained implementation rather than delegating the "mark paid"
// step to _handleOrderPaymentWebhook, precisely because that delegation
// is what used to leave the gap: the debit and the order's payment_status
// flip were two separate, non-atomic steps, so a second attempt could
// slip in between them and debit the wallet twice for one order. Once
// this transaction commits, the money has moved and the order is already
// marked paid - none of the downstream effects below (seller wallet
// crediting, EFD receipt, loyalty/referral, notifications) can undo that,
// so each runs best-effort with its own error handling, mirroring exactly
// what _handleOrderPaymentWebhook does for every other payment method.
exports.initiateWalletOrderPayment = async (orderId, buyerId) => {
    const db = require("../../config/db");
    const buyerWalletService = require("../buyerWallet/buyerWallet.service");

    let order;
    let payment;
    let chargeAmount;
    let receiptNumber;
    let isPreorderDepositLeg;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        order = await orderRepository.findOrderByIdForUpdate(orderId, connection);

        if (!order || order.buyer_id !== buyerId) {
            throw new Error("Order not found");
        }
        if (order.payment_method !== "wallet") {
            throw new Error("This order is not set up for wallet payment");
        }
        if (order.status === "cancelled") {
            throw new Error("This order has been cancelled and can no longer be paid");
        }

        isPreorderDepositLeg = order.order_type === "pre_order" && order.payment_status === "unpaid";
        const alreadyPaidForThisLeg = order.order_type === "pre_order"
            ? ["deposit_paid", "paid"].includes(order.payment_status) && !isPreorderDepositLeg
            : order.payment_status === "paid";
        if (alreadyPaidForThisLeg) {
            throw new Error("This order has already been paid");
        }

        await assertNoRecentPendingAttempt({ orderId: order.id });

        chargeAmount = resolveChargeAmount(order);
        const reference = paymentReference.build("order", order.id);
        const paymentId = await paymentRepository.create(
            order.id, "wallet", chargeAmount, resolvePaymentLeg(order), reference, connection
        );
        payment = { id: paymentId, payment_reference: reference };

        await buyerWalletService.debitForOrder(buyerId, chargeAmount, orderId, paymentId, connection);

        receiptNumber = generateReceiptNumber();
        const claimed = await paymentRepository.claimCompleted(
            paymentId, `WALLET-${orderId}`, receiptNumber, null, chargeAmount, connection
        );
        if (!claimed) {
            // Cannot happen for a payment row created in this same
            // transaction (it starts 'pending') - guarded anyway rather
            // than silently continuing with money already debited.
            throw new Error("Could not finalize wallet payment");
        }

        if (isPreorderDepositLeg) {
            await orderRepository.markDepositPaid(orderId, connection);
        } else if (order.order_type === "pre_order") {
            await orderRepository.markBalancePaid(orderId, connection);
        } else {
            await orderRepository.updatePaymentStatus(orderId, "paid", connection);
        }

        if (order.is_parent && !isPreorderDepositLeg) {
            await orderRepository.updatePaymentStatusForChildren(orderId, "paid", connection);
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    // ---- Downstream effects (money has moved, order is paid - see the
    // function comment above for why these mirror _handleOrderPaymentWebhook
    // instead of calling it).
    const socketModule = require("../../socket/socket");

    auditService.log({
        eventType: "payment_processed",
        description: `Payment completed for order #${orderId}`,
        metadata: { orderId, success: true, transactionReference: `WALLET-${orderId}`, receiptNumber, chargedCurrency: null, chargedAmount: chargeAmount }
    });

    if (isPreorderDepositLeg) {
        socketModule.emitToUser(order.buyer_id, "payment:updated", {
            orderId, success: true, paymentStatus: "deposit_paid", receiptNumber
        });
        require("../notification/notification.service").notify({
            userId: order.buyer_id,
            type: "preorder_deposit_paid",
            titleKey: "notifications.order.preorderDepositPaid.title",
            messageKey: "notifications.order.preorderDepositPaid.message",
            messageParams: { orderNumber: order.order_number },
            relatedOrderId: orderId,
            withEmail: true
        }).catch((err) => logger.error({ err, orderId }, "preorder deposit notification error"));

        return { orderId, success: true, receiptNumber, paymentLeg: "deposit" };
    }

    if (order.is_parent) {
        const children = await orderRepository.findChildOrders(orderId);
        for (const child of children) {
            runCreditInBackground(payment, "Seller wallet credit", walletService.creditSellersForOrder(child.id), { orderId: child.id, parentOrderId: orderId });
            require("../efd/efd.service").issueReceiptForOrder(child.id).catch((err) => {
                logger.error({ err, orderId: child.id, parentOrderId: orderId }, "EFD receipt issuance error");
                Sentry.captureException(err, { tags: { area: "payment-webhook", stage: "efd-receipt" }, extra: { orderId: child.id, parentOrderId: orderId } });
            });
        }
    } else {
        runCreditInBackground(payment, "Seller wallet credit", walletService.creditSellersForOrder(orderId), { orderId });
        require("../efd/efd.service").issueReceiptForOrder(orderId).catch((err) => {
            logger.error({ err, orderId }, "EFD receipt issuance error");
            Sentry.captureException(err, { tags: { area: "payment-webhook", stage: "efd-receipt" }, extra: { orderId } });
        });
    }

    socketModule.emitToAdmins("admin:stats_changed", { reason: "payment_confirmed" });

    // Loyalty points and the referral bonus settle after delivery and the
    // return window - see rewardSettlement.service.js (Phase 6).

    socketModule.emitToUser(order.buyer_id, "payment:updated", {
        orderId, success: true, paymentStatus: "paid", receiptNumber
    });

    return { orderId, success: true, receiptNumber, paymentLeg: resolvePaymentLeg(order) };
};


// Follows initiateMobileMoneyPayment's shape exactly - a
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

    await subscriptionPaymentGuard.assertNoLivePendingSubscriptionPayment({ paymentRepository, subscriptionId });

    const reference = paymentReference.build("subscription", subscriptionId);
    const paymentId = await paymentRepository.createSubscriptionPayment(sellerId, subscriptionId, plan.price, "mobile_money", reference);


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

    await subscriptionPaymentGuard.assertNoLivePendingSubscriptionPayment({ paymentRepository, subscriptionId });

    const reference = paymentReference.build("subscription", subscriptionId);
    const paymentId = await paymentRepository.createSubscriptionPayment(sellerId, subscriptionId, plan.price, "snippe", reference);


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

// MalipoPay Card equivalent of initiateSnippeSubscriptionPayment above -
// same shape, different provider module/payment method string.
exports.initiateMalipopayCardSubscriptionPayment = async (sellerId, planId, { successUrl, cancelUrl }) => {
    const subscriptionRepository = require("../subscription/subscription.repository");
    const plan = await subscriptionRepository.findPlanById(planId);
    if (!plan) throw new Error("Plan not found");

    let subscription = await subscriptionRepository.findPendingForSeller(sellerId, planId);
    const subscriptionId = subscription
        ? subscription.id
        : await subscriptionRepository.createSubscription(sellerId, planId);

    await subscriptionPaymentGuard.assertNoLivePendingSubscriptionPayment({ paymentRepository, subscriptionId });

    const reference = paymentReference.build("subscription", subscriptionId);
    const paymentId = await paymentRepository.createSubscriptionPayment(sellerId, subscriptionId, plan.price, "malipopay_card", reference);


    const session = await malipopayCardProvider.createCheckoutSession({
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

    await subscriptionPaymentGuard.assertNoLivePendingSubscriptionPayment({ paymentRepository, subscriptionId });

    const reference = paymentReference.build("subscription", subscriptionId);
    const paymentId = await paymentRepository.createSubscriptionPayment(sellerId, subscriptionId, plan.price, "paypal", reference);

    const usdExchangeRate = await settingsService.getUsdExchangeRate();

    const result = await paypalProvider.createOrder({
        amountTzs: plan.price,
        usdExchangeRate,
        reference,
        description: `NEXORA ${plan.name} subscription`,
        returnUrl,
        cancelUrl
    });

    await paymentRepository.markPendingPaypal(paymentId, result.paypalOrderId, {
        expectedUsdAmount: result.usdAmount,
        usdExchangeRate
    });

    return { status: "redirect", url: result.approveUrl, usdAmount: result.usdAmount };
};

exports._handleSubscriptionPaymentWebhook = async (subscriptionId, success, transactionReference, chargedCurrency = null, chargedAmount = null, options = {}) => {
    const payment = await resolvePayment(options, () => paymentRepository.findLatestBySubscriptionId(subscriptionId));
    if (!payment) {
        throw permanentError(`No payment record found for subscription #${subscriptionId}`);
    }

    if (payment.status === "completed" || payment.status === "chargeback") {
        return { alreadyProcessed: true };
    }

    if (!success) {
        if (payment.status === "failed") return { alreadyProcessed: true };
        if (!(await paymentRepository.markFailed(payment.id))) return { alreadyProcessed: true };
        return { subscriptionId, success: false };
    }

    const mismatch = checkReportedAmount(payment, options);
    if (mismatch) {
        await flagAmountMismatch(payment, mismatch, { subscriptionId });
        return { subscriptionId, success: false, needsReview: true };
    }

    const receiptNumber = generateReceiptNumber();
    const wasFailed = payment.status === "failed";

    const claimed = await paymentRepository.claimCompleted(payment.id, transactionReference, receiptNumber, chargedCurrency, chargedAmount);
    if (!claimed) return { alreadyProcessed: true };
    if (wasFailed) noteLateSuccess(payment, { subscriptionId });

    const subscriptionRepository = require("../subscription/subscription.repository");
    const subscription = await subscriptionRepository.findById(subscriptionId);

    // The plan can only be bought once per pending subscription. If it is no
    // longer pending (a second payment succeeded first, or it was cancelled)
    // the money is real but has nothing to buy - a human decides the refund.
    if (!subscription || subscription.status !== "pending") {
        await paymentReviewService.flag({
            payment,
            reason: subscription && subscription.status === "active" ? REASONS.DUPLICATE_PAYMENT : REASONS.NOT_APPLICABLE,
            severity: "critical",
            details: { subscriptionId, subscriptionStatus: subscription ? subscription.status : "missing", requiresRefundReview: true }
        });
        return { subscriptionId, success: true, receiptNumber, requiresRefundReview: true };
    }

    try {
        const subscriptionService = require("../subscription/subscription.service");
        await subscriptionService.activateSubscription(subscriptionId);
    } catch (error) {
        await flagApplyFailure(payment, error, { subscriptionId });
        return { subscriptionId, success: true, receiptNumber, applyFailed: true };
    }

    return { subscriptionId, success: true, receiptNumber };
};

// ---- Booking payments Financial Integration) --------------------
// Follow initiateMobileMoneyPayment's shape, not the order-payment
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

    await assertNoRecentPendingAttempt({ bookingId });
    const reference = paymentReference.build("booking", bookingId);
    // Payer phone, encrypted (Phase 5, P0) - stored so a later
    // cancellation can push a mobile-money refund back out automatically
    // instead of landing in "please process this manually" every time
    // (see refundBookingPayment below). Encrypted, not plaintext: it's
    // PII this column exists purely to feed an automated refund call,
    // never to display.
    const { encryptPhone } = require("../../utils/phoneEncryption");
    const paymentId = await paymentRepository.createBookingPayment(
        bookingId, booking.amount, "mobile_money", reference, encryptPhone(phone)
    );


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

    await assertNoRecentPendingAttempt({ bookingId });
    const reference = paymentReference.build("booking", bookingId);
    const paymentId = await paymentRepository.createBookingPayment(bookingId, booking.amount, "snippe", reference);


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

// MalipoPay Card equivalent of initiateSnippeBookingPayment above.
exports.initiateMalipopayCardBookingPayment = async (bookingId, buyerId, { successUrl, cancelUrl }) => {
    const booking = await bookingRepository.findById(bookingId);

    if (!booking || booking.customer_id !== buyerId) {
        throw new Error("Booking not found");
    }

    if (booking.payment_status === "paid") {
        throw new Error("This booking has already been paid");
    }

    await assertNoRecentPendingAttempt({ bookingId });
    const reference = paymentReference.build("booking", bookingId);
    const paymentId = await paymentRepository.createBookingPayment(bookingId, booking.amount, "malipopay_card", reference);


    const session = await malipopayCardProvider.createCheckoutSession({
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

    await assertNoRecentPendingAttempt({ bookingId });
    const reference = paymentReference.build("booking", bookingId);
    const paymentId = await paymentRepository.createBookingPayment(bookingId, booking.amount, "paypal", reference);

    const usdExchangeRate = await settingsService.getUsdExchangeRate();

    const result = await paypalProvider.createOrder({
        amountTzs: booking.amount,
        usdExchangeRate,
        reference,
        description: `NEXORA booking ${booking.booking_reference}`,
        returnUrl,
        cancelUrl
    });

    await paymentRepository.markPendingPaypal(paymentId, result.paypalOrderId, {
        expectedUsdAmount: result.usdAmount,
        usdExchangeRate
    });

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
// Snippe/PayPal confirm the buyer/seller actually completed (or failed/
// cancelled) the payment on their end, by our own PayPal capture flow, by
// the stale sweep once it has asked the provider directly, and by the
// admin "accept payment" action. `providerReference` is the reference WE
// sent when initiating the attempt: ORDER-42-<random> for order payments
// (BOOKING-/SUB-/TOPUP- likewise); the old ORDER-42 shape is still parsed
// for payments already in flight. `chargedCurrency`/`chargedAmount` are
// only passed for foreign-currency gateways (PayPal) - see migration 028.
// `reportedAmount`/`reportedCurrency` are what the provider says it
// actually charged; when present they are compared with the expected
// amount and a mismatch goes to admin review instead of marking it paid.
exports.handleProviderWebhook = async ({
    providerReference,
    success,
    transactionReference,
    chargedCurrency,
    chargedAmount,
    reportedAmount,
    reportedCurrency,
    skipAmountCheck,
    payment
}) => {
    const parsed = paymentReference.parse(providerReference);

    if (!parsed) {
        throw permanentError(`Unrecognized payment reference: ${providerReference}`);
    }

    const options = {
        paymentReference: parsed.suffix ? parsed.reference : null,
        reportedAmount,
        reportedCurrency,
        skipAmountCheck,
        payment
    };

    if (parsed.kind === "order") {
        return exports._handleOrderPaymentWebhook(parsed.id, success, transactionReference, chargedCurrency, chargedAmount, options);
    }

    if (parsed.kind === "booking") {
        return exports._handleBookingPaymentWebhook(parsed.id, success, transactionReference, chargedCurrency, chargedAmount, options);
    }

    if (parsed.kind === "subscription") {
        return exports._handleSubscriptionPaymentWebhook(parsed.id, success, transactionReference, chargedCurrency, chargedAmount, options);
    }

    return exports._handleWalletTopupWebhook(parsed.id, success, transactionReference, chargedCurrency, chargedAmount, options);
};

// The booking equivalent of _handleOrderPaymentWebhook below - much
// simpler since a booking has exactly one provider (no parent/child
// split to propagate payment_status across - see 063's design notes) and
// always goes through escrow (no Cash-on-Delivery-shaped path for a
// service - see walletService.creditProvidersForBooking).
exports._handleBookingPaymentWebhook = async (bookingId, success, transactionReference, chargedCurrency = null, chargedAmount = null, options = {}) => {
    const payment = await resolvePayment(options, () => paymentRepository.findByBookingId(bookingId));

    if (!payment) {
        throw permanentError(`No payment record found for booking #${bookingId}`);
    }

    if (payment.status === "completed" || payment.status === "chargeback") {
        return { alreadyProcessed: true };
    }

    if (!success) {
        if (payment.status === "failed") return { alreadyProcessed: true };
        if (!(await paymentRepository.markFailed(payment.id))) return { alreadyProcessed: true };
        auditService.log({
            eventType: "payment_processed",
            description: `Payment failed for booking #${bookingId}`,
            metadata: { bookingId, success: false, transactionReference }
        });
        return { bookingId, success: false };
    }

    const mismatch = checkReportedAmount(payment, options);
    if (mismatch) {
        await flagAmountMismatch(payment, mismatch, { bookingId });
        return { bookingId, success: false, needsReview: true };
    }

    const receiptNumber = generateReceiptNumber();
    const wasFailed = payment.status === "failed";

    const claimed = await paymentRepository.claimCompleted(payment.id, transactionReference, receiptNumber, chargedCurrency, chargedAmount);
    if (!claimed) return { alreadyProcessed: true };
    if (wasFailed) noteLateSuccess(payment, { bookingId });

    const booking = await bookingRepository.findById(bookingId);

    // Money arrived for a booking that was cancelled/refunded in the
    // meantime, or that another payment already paid: it is real money that
    // must not be credited to the provider - flag it for a refund decision.
    if (booking && (booking.status === "cancelled" || booking.status === "refunded")) {
        await paymentReviewService.flag({
            payment,
            reason: REASONS.PAID_AFTER_CANCEL,
            severity: "critical",
            details: { bookingId, bookingStatus: booking.status, requiresRefundReview: true }
        });
        require("../../socket/socket").emitToUser(booking.customer_id, "payment:updated", {
            bookingId, success: false, paymentStatus: "unpaid",
            message: "Your booking was cancelled before this payment could be applied. We'll be in touch about a refund."
        });
        return { bookingId, success: false, cancelledBookingRefundNeeded: true, requiresRefundReview: true };
    }

    if (booking && booking.payment_status === "paid") {
        await paymentReviewService.flag({
            payment,
            reason: REASONS.DUPLICATE_PAYMENT,
            severity: "critical",
            details: { bookingId, requiresRefundReview: true }
        });
        return { bookingId, success: true, receiptNumber, duplicatePayment: true, requiresRefundReview: true };
    }

    await bookingRepository.updatePaymentStatus(bookingId, "paid");

    // This is the critical case: the buyer's payment already succeeded
    // (we're past that point above) but crediting the provider's wallet
    // may fail - money is "stuck" in escrow state until reconciled, so it
    // goes to Sentry and the admin review queue, not just the log.
    runCreditInBackground(payment, "Provider wallet credit", walletService.creditProvidersForBooking(bookingId), { bookingId });

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
// Not called from booking.service.js anymore as of Phase 5 -
// cancelBooking/rejectBooking now go through
// refund.service.js#autoRefundForBooking instead, which gives booking
// refunds a tracked row/retry/admin-queue the same way order refunds
// already had and this function's direct fire-and-forget call never
// did. Left in place (still exported, still correct) in case something
// else needs a one-off booking refund outside that tracked flow; new
// callers should prefer autoRefundForBooking.
exports.refundBookingPayment = async (bookingId, amount) => {
    const payment = await paymentRepository.findByBookingId(bookingId);

    if (!payment || payment.status !== "completed") {
        return { success: false, error: "No completed payment found for this booking" };
    }

    if (payment.method === "mobile_money") {
        // Payer phone, decrypted from the payment row (Phase 5, P0) -
        // previously bookings had nowhere this refund path could read a
        // phone number back from (the buyer's phone was only ever held
        // in memory for the initial payment call), so every mobile-money
        // booking refund landed as "please process this manually". Now
        // that initiateMobileMoneyBookingPayment stores it encrypted,
        // the refund can actually go out automatically.
        const { decryptPhone } = require("../../utils/phoneEncryption");
        const phone = decryptPhone(payment.payer_phone_encrypted);

        if (!phone) {
            const booking = await bookingRepository.findById(bookingId);
            return {
                success: false,
                error: "No payer phone number on file for this payment - please process this refund manually",
                requiresManualHandling: true,
                booking
            };
        }

        const result = await mobileMoneyProvider.refund(phone, amount, {
            reference: `NEXORA-REFUND-BOOKING-${bookingId}`,
            description: `Refund for booking ${bookingId} cancellation`
        });
        return {
            success: Boolean(result.success),
            reference: result.transactionReference,
            error: result.success ? null : "Mobile money provider declined the refund"
        };
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

    if (payment.method === "malipopay_card") {
        if (!payment.transaction_reference) {
            return { success: false, error: "Payment has no MalipoPay Card transaction reference on file" };
        }
        const result = await malipopayCardProvider.refundPayment({
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

exports._handleOrderPaymentWebhook = async (orderId, success, transactionReference, chargedCurrency = null, chargedAmount = null, options = {}) => {
    const payment = await resolvePayment(options, () => paymentRepository.findByOrderId(orderId));

    if (!payment) {
        throw permanentError(`No payment record found for order #${orderId}`);
    }

    // Fetched up front (not just on the success path) so both branches can
    // push a live "payment:updated" event to the buyer's open order page -
    // see socket.emitToUser calls below. The buyer's browser only knows a
    // provider redirect/webhook happened, not whether it actually
    // succeeded, so it can't safely show a result until this event (or a
    // fresh GET /orders/:id) confirms it.
    const orderForNotify = await orderRepository.findOrderById(orderId);

    // Already processed - webhooks can be retried/duplicated by the
    // provider, so treat this as a no-op rather than an error. Only a
    // completed (or charged-back) payment is final: a payment we marked
    // FAILED can still receive a late success below.
    if (payment.status === "completed" || payment.status === "chargeback") {
        return { alreadyProcessed: true };
    }

    if (!success) {
        // A failure never overrides anything but a pending payment.
        if (payment.status === "failed") return { alreadyProcessed: true };
        if (!(await paymentRepository.markFailed(payment.id))) return { alreadyProcessed: true };

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

    const mismatch = checkReportedAmount(payment, options);
    if (mismatch) {
        await flagAmountMismatch(payment, mismatch, { orderId });
        return { orderId, success: false, needsReview: true };
    }

    const receiptNumber = generateReceiptNumber();
    const wasFailed = payment.status === "failed";

    // The race guard: only one delivery can flip pending/failed -> completed.
    const claimed = await paymentRepository.claimCompleted(payment.id, transactionReference, receiptNumber, chargedCurrency, chargedAmount);
    if (!claimed) return { alreadyProcessed: true };
    if (wasFailed) noteLateSuccess(payment, { orderId });

    // The order may have been cancelled (buyer-initiated, or the
    // staleOrders auto-cancel job) after payment was initiated but before
    // the provider's webhook arrived - a real race, not a hypothetical
    // one. Money moved on the provider's side, so the payment record is
    // completed (refund tracking / admin visibility) but the order itself
    // is never silently treated as a normal successful purchase: no seller
    // wallet credit, no "payment successful" notice - it is flagged for
    // refund review, admins are alerted, and the buyer is told.
    if (orderForNotify && orderForNotify.status === "cancelled") {
        auditService.log({
            eventType: "payment_processed",
            description: `Payment succeeded for order #${orderId} after it was already cancelled - needs manual refund review`,
            metadata: { orderId, success: true, transactionReference, receiptNumber, requiresRefundReview: true }
        });
        logger.warn({ orderId, transactionReference }, "Payment confirmed for a cancelled order - flagged for refund review");

        await paymentReviewService.flag({
            payment,
            reason: REASONS.PAID_AFTER_CANCEL,
            severity: "critical",
            details: { orderId, transactionReference, requiresRefundReview: true }
        });

        require("../notification/notification.service").notify({
            userId: orderForNotify.buyer_id,
            type: "payment_review",
            titleKey: "notifications.payment.paidAfterCancel.title",
            messageKey: "notifications.payment.paidAfterCancel.message",
            messageParams: { orderNumber: orderForNotify.order_number },
            relatedOrderId: orderId,
            withEmail: true
        }).catch((err) => logger.warn({ err, orderId }, "paid-after-cancel notify error"));

        require("../../socket/socket").emitToUser(orderForNotify.buyer_id, "payment:updated", {
            orderId, success: false, paymentStatus: "unpaid",
            message: "Your order was cancelled before this payment could be applied. We'll be in touch about a refund."
        });

        return { orderId, success: false, cancelledOrderRefundNeeded: true, requiresRefundReview: true };
    }

    // A different attempt already paid this order (or this leg of it): this
    // payment is real money with nothing left to buy. Never credit sellers
    // twice - flag it for a refund decision.
    const alreadyApplied = orderForNotify && (
        payment.payment_leg === "deposit"
            ? ["deposit_paid", "paid"].includes(orderForNotify.payment_status)
            : orderForNotify.payment_status === "paid"
    );

    if (alreadyApplied) {
        await paymentReviewService.flag({
            payment,
            reason: REASONS.DUPLICATE_PAYMENT,
            severity: "critical",
            details: { orderId, transactionReference, requiresRefundReview: true }
        });
        return { orderId, success: true, receiptNumber, duplicatePayment: true, requiresRefundReview: true };
    }

    // Pre-order / made-to-order (Phase 8) - orderForNotify was fetched
    // above, BEFORE this payment was applied, so its payment_status still
    // reflects the state this charge is resolving: 'unpaid' means this
    // was the deposit leg, anything else (a standard order, or a
    // pre-order already at 'deposit_paid') means this charge is what
    // finally brings the order to 'paid' and everything below - wallet
    // crediting, EFD receipt, referral/loyalty - should run exactly as
    // it always has.
    const isPreorderDepositLeg = orderForNotify
        && orderForNotify.order_type === "pre_order"
        && orderForNotify.payment_status === "unpaid";

    if (isPreorderDepositLeg) {
        await orderRepository.markDepositPaid(orderId);

        auditService.log({
            eventType: "payment_processed",
            description: `Deposit received for pre-order ${orderForNotify.order_number}`,
            metadata: { orderId, success: true, transactionReference, receiptNumber, chargedCurrency, chargedAmount, paymentLeg: "deposit" }
        });

        require("../../socket/socket").emitToUser(orderForNotify.buyer_id, "payment:updated", {
            orderId, success: true, paymentStatus: "deposit_paid", receiptNumber
        });

        // No wallet crediting / EFD receipt / referral points here - a
        // deposit isn't the order being "paid for" yet, just the first
        // half of it. Those all fire once the balance leg completes,
        // below, exactly like a normal order's single payment does.
        require("../notification/notification.service").notify({
            userId: orderForNotify.buyer_id,
            type: "preorder_deposit_paid",
            titleKey: "notifications.order.preorderDepositPaid.title",
            messageKey: "notifications.order.preorderDepositPaid.message",
            messageParams: { orderNumber: orderForNotify.order_number },
            relatedOrderId: orderId,
            withEmail: true
        }).catch((err) => logger.error({ err, orderId }, "preorder deposit notification error"));

        return { orderId, success: true, receiptNumber, paymentLeg: "deposit" };
    }

    // Pre-order balance leg reaching 'paid' also wants its own
    // balance_paid_at timestamp - markBalancePaid sets both payment_status
    // and that timestamp in one go; a standard order has no such column
    // to fill in, so it just gets the plain payment_status update.
    if (orderForNotify && orderForNotify.order_type === "pre_order") {
        await orderRepository.markBalancePaid(orderId);
    } else {
        await orderRepository.updatePaymentStatus(orderId, "paid");
    }

    // A multi-vendor cart is paid for once, on the parent order - but each
    // vendor child order has its own order_items (for wallet crediting)
    // and is what sellers/agents actually read payment_status off, so both
    // need to reflect "paid" too.
    const order = await orderRepository.findOrderById(orderId);

    if (order && order.is_parent) {
        const children = await orderRepository.findChildOrders(orderId);

        await orderRepository.updatePaymentStatusForChildren(orderId, "paid");

        for (const child of children) {
            runCreditInBackground(payment, "Seller wallet credit", walletService.creditSellersForOrder(child.id), { orderId: child.id, parentOrderId: orderId });
            // EFD e-invoicing - a receipt is per (single-vendor)
            // child order, same reasoning as wallet crediting just above.
            // No-op if the seller hasn't registered/been verified for EFD.
            require("../efd/efd.service").issueReceiptForOrder(child.id).catch((err) => {
                logger.error({ err, orderId: child.id, parentOrderId: orderId }, "EFD receipt issuance error");
                Sentry.captureException(err, { tags: { area: "payment-webhook", stage: "efd-receipt" }, extra: { orderId: child.id, parentOrderId: orderId } });
            });
        }
    } else {
        runCreditInBackground(payment, "Seller wallet credit", walletService.creditSellersForOrder(orderId), { orderId });
        require("../efd/efd.service").issueReceiptForOrder(orderId).catch((err) => {
            logger.error({ err, orderId }, "EFD receipt issuance error");
            Sentry.captureException(err, { tags: { area: "payment-webhook", stage: "efd-receipt" }, extra: { orderId } });
        });
    }

    const socketModule = require("../../socket/socket");
    socketModule.emitToAdmins("admin:stats_changed", { reason: "payment_confirmed" });

    // Loyalty points and the referral bonus settle after delivery and the
    // return window - see rewardSettlement.service.js (Phase 6).

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

// --- Snippe (card payments) --------------------------------------------
// Used for order checkout. Amounts are sent to Snippe as decimal TZS, so
// no currency conversion is needed (contrast with PayPal below).

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

    if (order.status === "cancelled") {
        throw new Error("This order has been cancelled and can no longer be paid");
    }

    const payment = await getOrCreateOrderPayment(order, "snippe");
    const chargeAmount = resolveChargeAmount(order);

    const reference = payment.payment_reference;

    const session = await snippeProvider.createCheckoutSession({
        amountTzs: chargeAmount,
        reference,
        description: `NEXORA order #${orderId}`,
        successUrl,
        cancelUrl
    });

    await paymentRepository.markPending(payment.id, session.sessionId);

    return { status: "redirect", url: session.url };
};

// Called from the Snippe / MalipoPay Card webhook controllers with an
// already signature-verified event (see snippeProvider.constructWebhookEvent
// / malipopayCardProvider.constructWebhookEvent). Both are hosted-checkout
// products with the same event shape, so one classifier serves both.
//   - a paid session          -> success
//   - expired / failed events -> failed (only ever moves a pending payment)
//   - dispute / chargeback    -> chargeback handling (see chargeback.service)
//   - anything else, including a "completed" session that is not actually
//     paid yet                -> ignored, never marked failed.
// Same caveat as the providers themselves: confirm the real event names and
// field names against the provider's docs / sandbox.
exports.handleCheckoutWebhookEvent = async (event) => {
    const classified = providerStatus.classifyCheckoutEvent(event);

    if (classified.kind === "ignore") {
        return { ignored: true };
    }

    if (!classified.reference) {
        throw permanentError("Checkout event carries no payment reference");
    }

    if (classified.kind === "chargeback") {
        return exports.handleChargebackEvent({
            providerReference: classified.reference,
            transactionReference: classified.transactionReference,
            reason: classified.reason
        });
    }

    return exports.handleProviderWebhook({
        providerReference: classified.reference,
        success: classified.kind === "success",
        transactionReference: classified.transactionReference,
        reportedAmount: classified.reportedAmount,
        reportedCurrency: classified.reportedCurrency
    });
};


// --- MalipoPay Card (card payments) -------------------------------------
// A separate card-checkout product from MalipoPay - do not confuse with
// the mobile_money rail's malipopay.provider.js (see that file's and
// malipopayCard.provider.js's header comments). Used for order checkout
// and the seller verification fee, same as Snippe above; amounts are
// sent as decimal TZS, so no currency conversion is needed.

exports.initiateMalipopayCardOrderPayment = async (orderId, buyerId, { successUrl, cancelUrl }) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order || order.buyer_id !== buyerId) {
        throw new Error("Order not found");
    }

    if (order.payment_method !== "malipopay_card") {
        throw new Error("This order is not set up for MalipoPay Card payment");
    }

    if (order.payment_status === "paid") {
        throw new Error("This order has already been paid");
    }

    if (order.status === "cancelled") {
        throw new Error("This order has been cancelled and can no longer be paid");
    }

    const payment = await getOrCreateOrderPayment(order, "malipopay_card");
    const chargeAmount = resolveChargeAmount(order);

    const reference = payment.payment_reference;

    const session = await malipopayCardProvider.createCheckoutSession({
        amountTzs: chargeAmount,
        reference,
        description: `NEXORA order #${orderId}`,
        successUrl,
        cancelUrl
    });

    await paymentRepository.markPending(payment.id, session.sessionId);

    return { status: "redirect", url: session.url };
};

exports.handleSnippeWebhookEvent = exports.handleCheckoutWebhookEvent;
exports.handleMalipopayCardWebhookEvent = exports.handleCheckoutWebhookEvent;

// ---- Chargebacks / disputes ------------------------------------------------
// Finds the payment a chargeback is about (by our reference, else by the
// provider's own transaction id) and hands it to chargeback.service.
exports.handleChargebackEvent = async ({ providerReference, transactionReference, reason }) => {
    let payment = null;

    const parsed = paymentReference.parse(providerReference);
    if (parsed && parsed.suffix) {
        payment = await paymentRepository.findByPaymentReference(parsed.reference);
    } else if (parsed) {
        payment = parsed.kind === "order"
            ? await paymentRepository.findByOrderId(parsed.id)
            : parsed.kind === "booking"
                ? await paymentRepository.findByBookingId(parsed.id)
                : parsed.kind === "subscription"
                    ? await paymentRepository.findLatestBySubscriptionId(parsed.id)
                    : await paymentRepository.findLatestByTopUpId(parsed.id);
    }

    if (!payment && transactionReference) {
        payment = await paymentRepository.findByTransactionReference(transactionReference);
    }

    if (!payment) {
        throw permanentError(`No payment found for chargeback reference ${providerReference || transactionReference}`);
    }

    return require("./chargeback.service").processChargeback(payment, reason);
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

    if (order.status === "cancelled") {
        throw new Error("This order has been cancelled and can no longer be paid");
    }

    const payment = await getOrCreateOrderPayment(order, "paypal");
    const chargeAmount = resolveChargeAmount(order);

    const usdExchangeRate = await settingsService.getUsdExchangeRate();
    const reference = payment.payment_reference;

    const result = await paypalProvider.createOrder({
        amountTzs: chargeAmount,
        usdExchangeRate,
        reference,
        description: `NEXORA order #${orderId}`,
        returnUrl,
        cancelUrl
    });

    await paymentRepository.markPendingPaypal(payment.id, result.paypalOrderId, {
        expectedUsdAmount: result.usdAmount,
        usdExchangeRate
    });

    return { status: "redirect", url: result.approveUrl, usdAmount: result.usdAmount };
};

// Whether the payment row belongs to the logged-in user - an order's buyer,
// a booking's customer, or the seller/buyer a subscription / top-up payment
// was created for. Anything else is reported as "not found" (never reveal
// that someone else's payment exists).
const assertPaymentBelongsToUser = async (payment, userId) => {
    let ownerId = null;

    if (payment.purpose === "order_payment") {
        const order = await orderRepository.findOrderById(payment.order_id);
        ownerId = order ? order.buyer_id : null;
    } else if (payment.purpose === "booking_payment") {
        const booking = await bookingRepository.findById(payment.booking_id);
        ownerId = booking ? booking.customer_id : null;
    } else {
        ownerId = payment.seller_id;
    }

    if (ownerId === null || ownerId === undefined || Number(ownerId) !== Number(userId)) {
        throw new Error("Payment not found");
    }
};

// Called by our own /paypal/capture endpoint once the buyer/seller is
// redirected back from PayPal's approval page (?token=<paypalOrderId>).
//
// Before anything is captured the PayPal order id must be well formed and
// must belong to a payment row of ours that belongs to THIS user - the old
// code captured whatever id it was handed.
//
// A capture that fails is not automatically a decline: a timeout or a 5xx
// tells us nothing about whether PayPal took the money. Only a definite
// decline is written as a terminal failure; anything unclear re-fetches the
// PayPal order first, and if it still cannot be settled the payment is left
// pending (the webhook / stale sweep will resolve it).
exports.capturePaypalPayment = async (paypalOrderId, userId) => {
    paypalProvider.assertValidOrderId(paypalOrderId);

    const payment = await paymentRepository.findByTransactionReference(paypalOrderId);
    if (!payment || payment.method !== "paypal") {
        throw new Error("Payment not found");
    }

    await assertPaymentBelongsToUser(payment, userId);

    if (payment.status === "completed") {
        return { alreadyProcessed: true, success: true };
    }

    let outcome = await paypalProvider.captureOrder(paypalOrderId, {
        requestId: payment.payment_reference || `NEXORA-PAYPAL-${payment.id}`
    });

    if (outcome.state === "unknown") {
        // Was it actually captured? Ask PayPal before writing anything.
        try {
            outcome = await paypalProvider.getOrder(paypalOrderId);
        } catch (error) {
            logger.warn({ err: error, paymentId: payment.id }, "PayPal order re-fetch after an unclear capture failed");
            outcome = { state: "unknown" };
        }
    }

    if (outcome.state === "pending" || outcome.state === "unknown" || outcome.state === "abandoned") {
        return {
            success: false,
            status: "pending",
            message: "We could not confirm this PayPal payment yet. If you were charged, it will be applied automatically."
        };
    }

    const success = outcome.state === "success";
    const providerReference = referenceForPayment(payment);
    const usdAmount = outcome.amount ?? (success ? payment.expected_usd_amount : null);

    return exports.handleProviderWebhook({
        providerReference,
        payment,
        success,
        transactionReference: outcome.transactionReference || paypalOrderId,
        chargedCurrency: success ? "USD" : null,
        chargedAmount: success ? usdAmount : null,
        reportedAmount: success && outcome.amount !== undefined ? outcome.amount : undefined,
        reportedCurrency: success ? (outcome.currency || "USD") : undefined
    });
};

// PayPal webhook events (signature already verified by the controller).
//   PAYMENT.CAPTURE.COMPLETED -> success
//   PAYMENT.CAPTURE.DENIED    -> a definite decline
//   PAYMENT.CAPTURE.REVERSED / CUSTOMER.DISPUTE.CREATED -> chargeback
// PENDING, REFUNDED (our own refunds) and everything else are ignored.
exports.handlePaypalWebhookEvent = async (event) => {
    const type = String(event.event_type || "");
    const resource = event.resource || {};

    const paypalOrderId = resource.supplementary_data?.related_ids?.order_id || null;
    const captureId = type.startsWith("CUSTOMER.DISPUTE")
        ? resource.disputed_transactions?.[0]?.seller_transaction_id
        : resource.id;

    const findPayment = async () => {
        if (resource.custom_id) {
            const parsed = paymentReference.parse(resource.custom_id);
            if (parsed && parsed.suffix) {
                const byReference = await paymentRepository.findByPaymentReference(parsed.reference);
                if (byReference) return byReference;
            }
        }
        if (paypalOrderId) {
            const byOrder = await paymentRepository.findByTransactionReference(paypalOrderId);
            if (byOrder) return byOrder;
        }
        if (captureId) {
            return paymentRepository.findByTransactionReference(captureId);
        }
        return null;
    };

    if (type === "PAYMENT.CAPTURE.COMPLETED" || type === "PAYMENT.CAPTURE.DENIED") {
        const payment = await findPayment();
        if (!payment) throw permanentError(`No payment found for PayPal event ${event.id}`);

        const success = type === "PAYMENT.CAPTURE.COMPLETED";
        const amount = resource.amount ? Number(resource.amount.value) : undefined;
        const currency = resource.amount ? resource.amount.currency_code : undefined;

        return exports.handleProviderWebhook({
            providerReference: referenceForPayment(payment),
            payment,
            success,
            transactionReference: captureId || payment.transaction_reference,
            chargedCurrency: success ? "USD" : null,
            chargedAmount: success && amount !== undefined ? amount : null,
            reportedAmount: success ? amount : undefined,
            reportedCurrency: success ? currency : undefined
        });
    }

    if (type === "PAYMENT.CAPTURE.REVERSED" || type === "CUSTOMER.DISPUTE.CREATED") {
        const payment = await findPayment();
        if (!payment) throw permanentError(`No payment found for PayPal event ${event.id}`);

        return require("./chargeback.service").processChargeback(
            payment,
            resource.reason || resource.status_details?.reason || type
        );
    }

    return { ignored: true };
};

// (Resilience & Growth). Purely additive - reads the registry's
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

// Shared by confirmDeliveryReceipt (buyer-triggered, below) and
// jobs/codAutoConfirm.job.js (system-triggered once cod_auto_confirm_hours
// has passed with no buyer action - Phase 2, P0: Cash on Delivery no
// longer depends on the buyer remembering to tap "confirm"). Completes the
// payment side of a Cash on Delivery order once receipt is confirmed one
// way or the other.
const completeCodPayment = async (order) => {
    let payment = await paymentRepository.findByOrderId(order.id);

    if (!payment) {
        const paymentId = await paymentRepository.create(
            order.id,
            "cash_on_delivery",
            order.total_amount
        );
        payment = { id: paymentId };
    }

    const receiptNumber = generateReceiptNumber();

    await paymentRepository.markCompleted(payment.id, null, receiptNumber);
    await orderRepository.updatePaymentStatus(order.id, "paid");

    walletService.creditSellersForOrder(order.id).catch((err) => {
        logger.error({ err, orderId: order.id }, "Seller wallet credit error");
        Sentry.captureException(err, { tags: { area: "payment", stage: "wallet-credit" }, extra: { orderId: order.id } });
    });

    return receiptNumber;
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

    const receiptNumber = await completeCodPayment(order);

    return { confirmed: true, paymentConfirmed: true, receiptNumber };
};

// Cash on Delivery auto-confirm (Phase 2, P0) - called only by
// jobs/codAutoConfirm.job.js, whose query already restricts candidates to
// status='delivered', payment_method='cash_on_delivery',
// buyer_confirmed_at IS NULL, delivered long enough ago, and no open
// dispute. Re-checks the couple of things that matter here defensively
// rather than trusting the query alone, same spirit as
// confirmDeliveryReceipt's own delivery_mode check above.
exports.autoConfirmCodDelivery = async (order) => {
    if (order.buyer_confirmed_at || order.payment_status === "paid") {
        return { confirmed: false, reason: "already_confirmed" };
    }
    if (order.delivery_mode !== "own") {
        return { confirmed: false, reason: "not_own_delivery" };
    }

    await orderRepository.markBuyerConfirmed(order.id);
    const receiptNumber = await completeCodPayment(order);

    return { confirmed: true, paymentConfirmed: true, receiptNumber };
};

// ---- Asking the provider directly ------------------------------------------
// Used by the stale sweep and the daily reconciliation so a payment is never
// failed (or an order cancelled) just because a webhook never arrived. Never
// throws: a provider that cannot answer is reported as state "unknown".
//   state: "success" | "failed" | "pending" | "unknown"
exports.checkProviderStatus = async (payment) => {
    const reference = referenceForPayment(payment);

    try {
        if (payment.method === "mobile_money") {
            const result = await mobileMoneyProvider.checkStatus(reference);
            return result || { state: "unknown" };
        }

        if (payment.method === "snippe") {
            if (!payment.transaction_reference) return { state: "unknown" };
            return await snippeProvider.getCheckoutSession(payment.transaction_reference);
        }

        if (payment.method === "malipopay_card") {
            const verified = await malipopayCardProvider.verifyPaymentStatus(reference);
            const raw = verified.raw || {};
            return {
                state: providerStatus.classifyStatus(verified.status),
                providerStatus: verified.status,
                transactionReference: raw.id || raw.reference || null,
                amount: raw.amount ?? null,
                currency: raw.currency || null
            };
        }

        if (payment.method === "paypal") {
            if (!payment.transaction_reference) return { state: "unknown" };
            return await paypalProvider.getOrder(payment.transaction_reference);
        }
    } catch (error) {
        logger.warn({ err: error, paymentId: payment.id, method: payment.method }, "provider status check failed");
        return { state: "unknown", error: error.message };
    }

    return { state: "unknown" };
};

// Settles one stale payment after asking the provider:
//   confirmed success  -> applied exactly like a webhook success
//   confirmed failure  -> failed
//   still pending      -> left alone (never failed on a guess)
//   provider can't say -> left alone until `unverifiableCutoffPassed`;
//                         after that it is failed. That is safe now: if the
//                         money does turn up later, the late-success path
//                         applies it or flags it for a refund.
exports.settleStalePayment = async (payment, { unverifiableCutoffPassed = false } = {}) => {
    const status = await exports.checkProviderStatus(payment);
    const providerReference = referenceForPayment(payment);

    if (status.state === "success") {
        const result = await exports.handleProviderWebhook({
            providerReference,
            payment,
            success: true,
            transactionReference: status.transactionReference || payment.transaction_reference,
            chargedCurrency: payment.method === "paypal" ? (status.currency || "USD") : undefined,
            chargedAmount: payment.method === "paypal" ? status.amount : undefined,
            reportedAmount: status.amount ?? undefined,
            reportedCurrency: status.currency || undefined
        });
        return { outcome: "applied", result };
    }

    const failedByProvider = status.state === "failed" || status.state === "abandoned";
    const failedByAge = status.state === "unknown" && unverifiableCutoffPassed;

    if (failedByProvider || failedByAge) {
        const result = await exports.handleProviderWebhook({
            providerReference,
            payment,
            success: false,
            transactionReference: payment.transaction_reference
        });
        return { outcome: "failed", result };
    }

    return { outcome: status.state === "pending" ? "still_pending" : "unverifiable" };
};

// Daily reconciliation: a payment we do NOT hold as completed that the
// provider says IS completed goes into the admin queue. (Nothing is applied
// automatically here - an admin reviews and accepts it from the queue.)
exports.reconcileUnsettledPayment = async (payment) => {
    const status = await exports.checkProviderStatus(payment);

    if (status.state !== "success") {
        return { flagged: false, state: status.state };
    }

    const { flagged } = await paymentReviewService.flag({
        payment,
        reason: REASONS.PROVIDER_COMPLETED_NOT_HERE,
        severity: "critical",
        details: {
            localStatus: payment.status,
            providerStatus: status.providerStatus || null,
            providerAmount: status.amount ?? null,
            providerReference: status.transactionReference || payment.transaction_reference || null
        }
    });

    return { flagged, state: status.state };
};

// ---- Admin review queue -------------------------------------------------
exports.listReviewQueue = (query) => paymentReviewService.list(query);

exports.resolveReviewItem = (id, adminId, note) => paymentReviewService.resolve(id, adminId, note);

// "The provider really did take this money - apply it." Only meaningful
// for payments that were held back rather than applied (a mismatched amount,
// or found completed at the provider by the reconciliation).
exports.acceptReviewedPayment = async (reviewId, adminId, note) => {
    const paymentReviewRepository = require("./paymentReview.repository");
    const item = await paymentReviewRepository.findById(reviewId);

    if (!item) throw new Error("Review item not found");
    if (item.status !== "open") throw new Error("This review item is already resolved");
    if (![REASONS.AMOUNT_MISMATCH, REASONS.PROVIDER_COMPLETED_NOT_HERE].includes(item.reason)) {
        throw new Error("This kind of review item cannot be applied automatically - resolve it after handling it manually");
    }

    const payment = await paymentRepository.findById(item.payment_id);
    if (!payment) throw new Error("Payment not found");

    const result = await exports.handleProviderWebhook({
        providerReference: referenceForPayment(payment),
        payment,
        success: true,
        transactionReference: payment.transaction_reference,
        skipAmountCheck: true
    });

    await paymentReviewService.resolve(reviewId, adminId, note || "Accepted and applied");
    return result;
};
