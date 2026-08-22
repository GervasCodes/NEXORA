/**
 * Refund automation (Phase 2).
 *
 * Entry point: exports.autoRefundForDispute(), called from
 * dispute.service.js's resolveDispute() whenever an admin resolves a
 * dispute with resolution 'refund_full' or 'refund_partial'. Like the
 * wallet-reversal and buyer/seller notification calls already in that
 * function, this is invoked fire-and-forget (the admin's resolve
 * request doesn't block on a payment gateway round-trip) - the caller
 * does `.catch(err => console.error(...))` rather than awaiting it.
 *
 * Idempotency: refunds.dispute_id is UNIQUE (migration 038). A dispute
 * can only ever have one refund row, so a duplicate trigger (resolve
 * called twice, a process crash-and-retry, etc) always resolves to the
 * *same* row rather than double-refunding the buyer - see
 * findOrCreateRefundRow() below.
 *
 * Retries: each automatic attempt series runs up to MAX_ATTEMPTS times
 * with a short exponential backoff, entirely within the one
 * autoRefundForDispute() call. If every attempt fails, the row is left
 * in 'failed' so an admin can see it on the refunds dashboard and call
 * exports.retryRefund() to try again by hand (e.g. after fixing
 * provider credentials, or once the buyer's mobile money wallet is
 * reachable again).
 */

const refundRepository = require("./refund.repository");
const paymentRepository = require("../payment/payment.repository");
const orderRepository = require("../order/order.repository");
const auditService = require("../audit/audit.service");
const mobileMoneyProvider = require("../payment/providers/mobileMoney.provider");
const snippeProvider = require("../payment/providers/snippe.provider");
const malipopayCardProvider = require("../payment/providers/malipopayCard.provider");
const paypalProvider = require("../payment/providers/paypal.provider");

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [1000, 3000]; // delay before attempt 2 and attempt 3

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Mirrors the ER_DUP_ENTRY code mysql2 throws on a UNIQUE constraint hit.
const isDuplicateKeyError = (err) => err && (err.code === "ER_DUP_ENTRY" || err.errno === 1062);

// Phase Q1: generalized over the refund's source (a dispute or a
// return) rather than being dispute-only. `source` is
// { type: "dispute" | "return", id, orderId, buyerId, sellerId }.
// idempotency_key/dispute_id/return_id are what actually enforce "one
// refund per source" at the DB layer (see findByDisputeId/findByReturnId
// below) - this just recovers the existing row on a race/retry instead
// of erroring.
const findExistingForSource = async (source) => (
    source.type === "dispute"
        ? refundRepository.findByDisputeId(source.id)
        : refundRepository.findByReturnId(source.id)
);

const findOrCreateRefundRow = async ({ source, payment, amount, requestedBy }) => {
    const existing = await findExistingForSource(source);
    if (existing) {
        return { refund: existing, alreadyExisted: true };
    }

    try {
        const id = await refundRepository.create({
            disputeId: source.type === "dispute" ? source.id : null,
            returnId: source.type === "return" ? source.id : null,
            paymentId: payment.id,
            orderId: source.orderId,
            buyerId: source.buyerId,
            sellerId: source.sellerId,
            provider: payment.method,
            amount,
            idempotencyKey: `${source.type}:${source.id}`,
            requestedBy
        });
        return { refund: await refundRepository.findById(id), alreadyExisted: false };
    } catch (err) {
        if (isDuplicateKeyError(err)) {
            // Lost a race with another concurrent call for the same
            // source - the winner's row is the source of truth.
            const raced = await findExistingForSource(source);
            if (raced) return { refund: raced, alreadyExisted: true };
        }
        throw err;
    }
};

// Refund rows come from either a dispute or a return (Phase Q1) - this
// just renders whichever source pointer is set, for provider references
// and log/audit text.
const sourceLabel = (refund) => (refund.dispute_id ? `dispute #${refund.dispute_id}` : `return #${refund.return_id}`);
const sourceSlug = (refund) => (refund.dispute_id ? `dispute_${refund.dispute_id}` : `return_${refund.return_id}`);

// Calls the actual payment provider for one refund attempt. Returns
// { success, reference } on a completed call, or throws/returns
// { success: false, error } otherwise - callers decide what to do with
// a failure (retry vs give up).
const callProvider = async (refund, payment) => {
    if (payment.method === "mobile_money") {
        const order = await orderRepository.findOrderById(refund.order_id);
        if (!order || !order.shipping_phone) {
            return { success: false, error: "Order has no phone number on file to refund to" };
        }
        const result = await mobileMoneyProvider.refund(order.shipping_phone, refund.amount, {
            reference: `NEXORA-REFUND-${sourceSlug(refund).toUpperCase()}`,
            description: `Refund for ${sourceLabel(refund)}`
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
            amountTzs: refund.amount,
            reason: sourceSlug(refund)
        });
        return { success: Boolean(result.success), reference: result.refundReference, error: result.error };
    }

    if (payment.method === "malipopay_card") {
        if (!payment.transaction_reference) {
            return { success: false, error: "Payment has no MalipoPay Card transaction reference on file" };
        }
        // MalipoPay's real API has no dedicated card-refund endpoint (see
        // malipopayCard.provider.js's comments) - a refund is issued as a
        // mobile money disbursement back to the buyer instead, same as
        // the mobile_money branch above, so it needs a phone number to
        // pay out to rather than just the original transaction reference.
        const order = await orderRepository.findOrderById(refund.order_id);
        if (!order || !order.shipping_phone) {
            return { success: false, error: "Order has no phone number on file to refund to" };
        }
        const result = await malipopayCardProvider.refundPayment({
            transactionReference: payment.transaction_reference,
            phoneNumber: order.shipping_phone,
            amountTzs: refund.amount,
            reason: sourceSlug(refund)
        });
        return { success: Boolean(result.success), reference: result.refundReference, error: result.error };
    }

    if (payment.method === "paypal") {
        if (!payment.transaction_reference) {
            return { success: false, error: "Payment has no PayPal capture id on file" };
        }
        const isFullRefund = Number(refund.amount) >= Number(payment.amount);
        const amountUsd = isFullRefund || !payment.charged_amount
            ? null
            : Number(((Number(refund.amount) / Number(payment.amount)) * Number(payment.charged_amount)).toFixed(2));

        const result = await paypalProvider.refundCapture(payment.transaction_reference, amountUsd);
        return { success: Boolean(result.success), reference: result.refundReference, error: result.error };
    }

    // cash_on_delivery (or anything unrecognized) has no online reversal.
    return { success: false, error: `No automatic refund path for payment method "${payment.method}"` };
};

// Refund rows now come from either a dispute or a return (Phase Q1) -
// sourceLabel/sourceSlug (declared above, near callProvider) render
// whichever source pointer is set for logs/audit text.

const attemptWithRetries = async (refund, payment) => {
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        await refundRepository.markProcessing(refund.id);

        try {
            const result = await callProvider(refund, payment);

            if (result.success) {
                await refundRepository.markCompleted(refund.id, result.reference || null);
                if (refund.return_id) {
                    // Lazy require: return.service.js requires this module to
                    // trigger the refund in the first place - avoids a
                    // circular require at module-load time.
                    require("../return/return.service").markRefunded(refund.return_id).catch(() => {});
                }
                auditService.log({
                    userId: refund.buyer_id,
                    eventType: "refund.completed",
                    description: `Refund of ${refund.amount} completed for ${sourceLabel(refund)} via ${payment.method} (attempt ${attempt})`,
                    metadata: { refundId: refund.id, disputeId: refund.dispute_id, returnId: refund.return_id, orderId: refund.order_id, provider: payment.method, reference: result.reference }
                });
                return { status: "completed" };
            }

            lastError = result.error || "Provider declined the refund";
        } catch (err) {
            lastError = err.message || "Unexpected error calling the payment provider";
        }

        if (attempt < MAX_ATTEMPTS) {
            await sleep(RETRY_BACKOFF_MS[attempt - 1] || RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]);
        }
    }

    await refundRepository.markFailed(refund.id, lastError);
    auditService.log({
        userId: refund.buyer_id,
        eventType: "refund.failed",
        description: `Refund of ${refund.amount} FAILED after ${MAX_ATTEMPTS} attempts for ${sourceLabel(refund)} via ${payment.method}: ${lastError}`,
        metadata: { refundId: refund.id, disputeId: refund.dispute_id, returnId: refund.return_id, orderId: refund.order_id, provider: payment.method, error: lastError }
    });
    return { status: "failed", error: lastError };
};

// ---- Public API ---------------------------------------------------------

// Called from dispute.service.js resolveDispute(). `dispute` is the
// pre-resolution dispute row (has order_id/buyer_id/seller_id); `amount`
// is the refund_amount already validated by the caller.
// Shared by autoRefundForDispute/autoRefundForReturn below - everything
// past "look up the payment" is identical regardless of which one
// triggered it, only the audit-log text differs (via sourceType/label).
const triggerRefund = async ({ source, label, amount, requestedBy }) => {
    const payment = await paymentRepository.findByOrderId(source.orderId);

    if (!payment || payment.status !== "completed") {
        auditService.log({
            userId: source.buyerId,
            eventType: "refund.manual_required",
            description: `${label} resolved with a refund, but no completed payment was found on order #${source.orderId} - needs manual handling`,
            metadata: { [`${source.type}Id`]: source.id, orderId: source.orderId }
        });
        return { status: "manual_required", reason: "No completed payment found for this order" };
    }

    const { refund, alreadyExisted } = await findOrCreateRefundRow({ source, payment, amount, requestedBy });

    if (alreadyExisted) {
        auditService.log({
            userId: source.buyerId,
            eventType: "refund.duplicate_trigger_skipped",
            description: `Refund already exists (status=${refund.status}) for ${label} - skipped duplicate auto-refund trigger`,
            metadata: { refundId: refund.id, [`${source.type}Id`]: source.id }
        });
        return { status: refund.status, refundId: refund.id };
    }

    auditService.log({
        userId: source.buyerId,
        eventType: "refund.triggered",
        description: `Automatic refund of ${amount} triggered for ${label} (order #${source.orderId}, via ${payment.method})`,
        metadata: { refundId: refund.id, [`${source.type}Id`]: source.id, orderId: source.orderId, provider: payment.method }
    });

    if (payment.method === "cash_on_delivery") {
        await refundRepository.markManualRequired(refund.id, "Cash on delivery has no online reversal - refund the buyer manually and mark this refund complete once done");
        auditService.log({
            userId: source.buyerId,
            eventType: "refund.manual_required",
            description: `Refund for ${label} needs manual handling - payment was Cash on Delivery`,
            metadata: { refundId: refund.id, [`${source.type}Id`]: source.id }
        });
        return { status: "manual_required", refundId: refund.id };
    }

    const result = await attemptWithRetries(await refundRepository.findById(refund.id), payment);
    return { ...result, refundId: refund.id };
};

exports.autoRefundForDispute = async ({ dispute, amount, requestedBy }) => triggerRefund({
    source: { type: "dispute", id: dispute.id, orderId: dispute.order_id, buyerId: dispute.buyer_id, sellerId: dispute.seller_id },
    label: `dispute #${dispute.id}`,
    amount,
    requestedBy
});

// Called from return.service.js#markReceived once a returned item is
// confirmed back in the seller's hands.
exports.autoRefundForReturn = async ({ orderReturn, amount, requestedBy }) => triggerRefund({
    source: { type: "return", id: orderReturn.id, orderId: orderReturn.order_id, buyerId: orderReturn.buyer_id, sellerId: orderReturn.seller_id },
    label: `return #${orderReturn.id}`,
    amount,
    requestedBy
});

// Admin-triggered manual retry of a 'failed' or 'manual_required' refund
// (refund.controller.js -> POST /admin/refunds/:id/retry).
exports.retryRefund = async (refundId, adminId) => {
    const refund = await refundRepository.findById(refundId);
    if (!refund) throw new Error("Refund not found");
    if (["completed", "processing"].includes(refund.status)) {
        throw new Error(`Refund is already "${refund.status}" - nothing to retry`);
    }

    const payment = await paymentRepository.findByOrderId(refund.order_id);
    if (!payment || payment.status !== "completed") {
        throw new Error("No completed payment found for this order - cannot retry automatically");
    }

    auditService.log({
        userId: adminId,
        eventType: "refund.manual_retry",
        description: `Admin manually retried refund #${refund.id} (dispute #${refund.dispute_id})`,
        metadata: { refundId: refund.id, disputeId: refund.dispute_id }
    });

    if (payment.method === "cash_on_delivery") {
        throw new Error("Cash on delivery refunds can't be retried automatically - handle the payout manually, then close this refund out");
    }

    return attemptWithRetries(refund, payment);
};

exports.getRefund = async (refundId) => refundRepository.findById(refundId);

exports.getRefundForDispute = async (disputeId) => refundRepository.findByDisputeId(disputeId);

exports.getRefundForReturn = async (returnId) => refundRepository.findByReturnId(returnId);

exports.listRefunds = async ({ status, limit } = {}) => refundRepository.findAll({ status, limit });
