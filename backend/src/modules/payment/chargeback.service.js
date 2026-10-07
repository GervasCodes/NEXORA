const db = require("../../config/db");
const paymentRepository = require("./payment.repository");
const chargebackRepository = require("./chargeback.repository");
const paymentReviewService = require("./paymentReview.service");
const walletRepository = require("../wallet/wallet.repository");
const orderRepository = require("../order/order.repository");
const fraudRepository = require("../fraud/fraud.repository");
const auditService = require("../audit/audit.service");
const logger = require("../../utils/logger").child({ module: "chargeback" });
const Sentry = require("../../config/sentry");

const { REASONS } = paymentReviewService;

// Takes back what a seller earned from a charged-back order. Held earnings
// are reversed first, then anything already released - but never below zero
// (negative seller balances are a Phase 2 decision). Whatever cannot be
// taken back is reported as a shortfall for an admin to chase.
const reverseOrderEarnings = async (orderId) => {
    const connection = await db.getConnection();
    const shortfalls = [];
    let reversedTotal = 0;

    try {
        await connection.beginTransaction();

        const items = await chargebackRepository.findReversibleOrderItems(orderId, connection);
        const bySeller = new Map();

        for (const item of items) {
            const entry = bySeller.get(item.seller_id) || { held: 0, released: 0 };
            const net = Number(item.seller_net_amount) || 0;
            if (item.wallet_released) entry.released += net; else entry.held += net;
            bySeller.set(item.seller_id, entry);
        }

        for (const [sellerId, amounts] of bySeller.entries()) {
            await walletRepository.ensureWallet(sellerId, connection);
            const wallet = await walletRepository.getWalletForUpdate(sellerId, connection);

            const heldReversal = Math.min(amounts.held, Math.max(Number(wallet.held_balance), 0));
            const balanceReversal = Math.min(amounts.released + (amounts.held - heldReversal), Math.max(Number(wallet.balance), 0));
            const wanted = amounts.held + amounts.released;
            const reversed = Number((heldReversal + balanceReversal).toFixed(2));

            if (heldReversal > 0) {
                const heldAfter = await walletRepository.incrementHeldBalance(sellerId, -heldReversal, connection);
                await walletRepository.insertTransaction({
                    sellerId, type: "debit", amount: heldReversal, balanceAfter: heldAfter,
                    referenceType: "order", referenceId: orderId,
                    description: `Card chargeback on order #${orderId} - held earnings reversed`
                }, connection);
            }

            if (balanceReversal > 0) {
                const balanceAfter = await walletRepository.incrementBalance(sellerId, -balanceReversal, connection);
                await walletRepository.insertTransaction({
                    sellerId, type: "debit", amount: balanceReversal, balanceAfter,
                    referenceType: "order", referenceId: orderId,
                    description: `Card chargeback on order #${orderId} - earnings reversed`
                }, connection);
            }

            reversedTotal += reversed;
            if (wanted - reversed > 0.009) {
                shortfalls.push({ sellerId, shortfall: Number((wanted - reversed).toFixed(2)) });
            }
        }

        await chargebackRepository.markItemsReversed(items.map((item) => item.id), connection);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    return { reversedTotal: Number(reversedTotal.toFixed(2)), shortfalls };
};

// A completed card payment was reversed / disputed by the buyer's bank.
//   1. the payment becomes `chargeback` (one conditional UPDATE - a repeated
//      event changes nothing);
//   2. the related seller/provider credit is reversed (held first; never
//      below zero) and closed for escrow release;
//   3. the buyer's order is flagged for review; an admin review item is
//      raised with everything needed to respond to the dispute.
// Reversal failures are reported (Sentry + admin queue), never swallowed.
exports.processChargeback = async (payment, reason) => {
    if (payment.status === "chargeback") {
        return { alreadyProcessed: true };
    }

    if (payment.status !== "completed") {
        // A dispute on a payment we never recorded as paid: nothing to
        // reverse yet, but a human should look.
        await paymentReviewService.flag({
            payment,
            reason: REASONS.CHARGEBACK,
            severity: "critical",
            details: { note: "Chargeback received for a payment that is not completed here", localStatus: payment.status, reason }
        });
        return { needsReview: true };
    }

    const marked = await paymentRepository.markChargeback(payment.id, reason);
    if (!marked) return { alreadyProcessed: true };

    logger.warn({ paymentId: payment.id, purpose: payment.purpose, reason }, "chargeback received");
    auditService.log({
        eventType: "payment_chargeback",
        description: `Chargeback on payment #${payment.id} (${payment.purpose})`,
        metadata: { paymentId: payment.id, purpose: payment.purpose, reason }
    });

    const details = { purpose: payment.purpose, reason: reason || null, reversedTotal: 0, shortfalls: [] };

    try {
        if (payment.purpose === "order_payment" && payment.order_id) {
            const { reversedTotal, shortfalls } = await reverseOrderEarnings(payment.order_id);
            details.reversedTotal = reversedTotal;
            details.shortfalls = shortfalls;

            // "Flag the buyer for review": fraud flags are keyed by order,
            // and every flag on an order shows the buyer beside it.
            const hasFlag = await fraudRepository.hasOpenFlag("order", payment.order_id, "chargeback");
            if (!hasFlag) {
                await fraudRepository.createFlag({
                    entityType: "order",
                    entityId: payment.order_id,
                    ruleCode: "chargeback",
                    reason: `Card chargeback / dispute on this order's payment (payment #${payment.id})`,
                    severity: "high"
                });
            }
        } else if (payment.purpose === "booking_payment" && payment.booking_id) {
            const walletService = require("../wallet/wallet.service");
            const booking = await chargebackRepository.sumBookingProviderNet(payment.booking_id);
            if (booking && booking.net > 0) {
                await walletService.reverseProviderEarningsForBooking(booking.providerId, booking.net, payment.booking_id);
                details.reversedTotal = booking.net;
            }
        }
    } catch (error) {
        logger.error({ err: error, paymentId: payment.id }, "chargeback earnings reversal failed");
        Sentry.captureException(error, { tags: { area: "chargeback", stage: "reversal" }, extra: { paymentId: payment.id } });
        details.reversalError = error.message;
    }

    await paymentReviewService.flag({
        payment,
        reason: REASONS.CHARGEBACK,
        severity: "critical",
        details
    });

    if (details.shortfalls.length > 0) {
        await paymentReviewService.flag({
            payment,
            reason: REASONS.CHARGEBACK_SHORTFALL,
            severity: "critical",
            details: { shortfalls: details.shortfalls }
        });
    }

    return { chargeback: true, reversedTotal: details.reversedTotal, shortfalls: details.shortfalls };
};
