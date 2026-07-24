const db = require("../../config/db");
const walletRepository = require("./wallet.repository");
const orderRepository = require("../order/order.repository");
const disputeRepository = require("../dispute/dispute.repository");
const settingsService = require("../settings/settings.service");
const notificationService = require("../notification/notification.service");
const fraudService = require("../fraud/fraud.service");

// Called once an order's payment is confirmed (mobile money success, or a
// Cash on Delivery confirmation). Splits the order's line items by seller,
// applies the platform's current commission rate, and credits each
// seller's wallet with their net amount. Idempotent: only touches
// order_items rows that haven't been credited yet, so it's safe to call
// more than once for the same order.
//
// Escrow (Phase 9C): which wallet column gets credited depends on the
// order's payment method. For mobile money / Snippe / PayPal, the
// platform actually holds the buyer's money from the moment the provider
// webhook confirms payment - so the seller's earnings go into
// `held_balance` (not withdrawable) and stay there until Phase 9D's
// release job (delivered + escrow_hold_days elapsed, no open dispute)
// moves them into `balance`. Cash on Delivery is different: the seller
// already has the cash in hand by the time `confirmCashOnDelivery` can
// even run (it requires the order to already be `delivered`), so there
// is no platform-held money to hold back - COD earnings go straight to
// `balance`, exactly as every payment method did before this phase, and
// the corresponding order_items rows are marked `wallet_released = TRUE`
// immediately so Phase 9D's release job never picks them up. See
// docs/ESCROW_ANALYSIS.md section 3.2 for the reasoning.
exports.creditSellersForOrder = async (orderId) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const items = await walletRepository.findUncreditedItemsByOrder(orderId, connection);

        if (items.length === 0) {
            await connection.commit();
            return;
        }

        const order = await orderRepository.findOrderById(orderId);
        const isEscrowed = order && order.payment_method !== "cash_on_delivery";

        const commissionRate = await settingsService.getCommissionRate();

        // Group this order's uncredited items by seller so a multi-vendor
        // order results in one wallet credit (and one ledger row) per seller.
        const bySeller = new Map();
        for (const item of items) {
            const sellerSubtotal = Number(item.subtotal);
            const commissionAmount = Number((sellerSubtotal * (commissionRate / 100)).toFixed(2));
            const netAmount = Number((sellerSubtotal - commissionAmount).toFixed(2));

            await walletRepository.markItemCredited(
                item.id, commissionRate, commissionAmount, netAmount, !isEscrowed, connection
            );

            const existing = bySeller.get(item.seller_id) || 0;
            bySeller.set(item.seller_id, existing + netAmount);
        }

        for (const [sellerId, netAmount] of bySeller.entries()) {
            await walletRepository.ensureWallet(sellerId, connection);
            await walletRepository.getWalletForUpdate(sellerId, connection);

            if (isEscrowed) {
                const heldAfter = await walletRepository.incrementHeldBalance(sellerId, netAmount, connection);

                await walletRepository.insertTransaction({
                    sellerId,
                    type: "credit",
                    amount: netAmount,
                    balanceAfter: heldAfter,
                    referenceType: "order",
                    referenceId: orderId,
                    description: `Sale earnings for order #${orderId} held pending release (${commissionRate}% platform commission deducted)`
                }, connection);
            } else {
                const balanceAfter = await walletRepository.incrementBalance(sellerId, netAmount, connection);

                await walletRepository.insertTransaction({
                    sellerId,
                    type: "credit",
                    amount: netAmount,
                    balanceAfter,
                    referenceType: "order",
                    referenceId: orderId,
                    description: `Sale earnings for order #${orderId} (${commissionRate}% platform commission deducted)`
                }, connection);
            }
        }

        await connection.commit();

        for (const sellerId of bySeller.keys()) {
            notificationService.notify({
                userId: sellerId,
                type: "wallet_credit",
                titleKey: "notifications.wallet.credited.title",
                messageKey: "notifications.wallet.credited.message",
                messageParams: { orderId },
                relatedOrderId: orderId,
                withEmail: false
            }).catch((err) => console.error("wallet credit notify error:", err));
        }

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

exports.getWalletSummary = async (sellerId) => {
    await walletRepository.ensureWallet(sellerId);
    const wallet = await walletRepository.getWallet(sellerId);
    const transactions = await walletRepository.findTransactions(sellerId, 50);

    return {
        balance: Number(wallet.balance),
        heldBalance: Number(wallet.held_balance),
        transactions
    };
};

// ---- Escrow release (Phase 9D) ---------------------------------------------

const OPEN_DISPUTE_STATUSES = ["open", "under_review"];
const REFUND_RESOLUTIONS = ["refund_full", "refund_partial"];

// Shared by the release job (scans every eligible item platform-wide)
// and the admin manual early-release action (one order's items) - see
// docs/ESCROW_ANALYSIS.md section 3.4. Items are grouped by order so
// each order's disputes are fetched once, then the same rule is applied
// to every item, closing the precision gap flagged in the Phase 9C
// README (an item's held earnings may have already been reversed by a
// dispute refund, which is pooled against the seller's wallet rather
// than tied to a specific order_item):
//
//  - an open/under_review dispute against the item, or against the whole
//    order (order_item_id is null for a whole-order dispute), freezes
//    it - skip, it's picked up again on a later run once the dispute
//    closes.
//  - a dispute already resolved with a refund has already reversed this
//    item's earnings out of held_balance via
//    dispute.service.js#reverseSellerEarnings - there's nothing left to
//    release, so just close the item out (wallet_released = TRUE) with
//    no wallet movement, so the release job stops rescanning it.
//  - anything else (no dispute at all, or one resolved without a
//    refund - rejected, or resolved with replacement/compensation/
//    no_action) is a normal release: move the item's net amount from
//    held_balance to balance and mark it released.
const releaseItems = async (items) => {
    const summary = { released: 0, closedByDispute: 0, frozen: 0, amountReleased: 0 };
    if (items.length === 0) {
        return summary;
    }

    const disputesByOrder = new Map();
    const getOrderDisputes = async (orderId) => {
        if (!disputesByOrder.has(orderId)) {
            disputesByOrder.set(orderId, await disputeRepository.findByOrderId(orderId));
        }
        return disputesByOrder.get(orderId);
    };

    const releasedSellerIds = new Set();

    for (const item of items) {
        const disputes = await getOrderDisputes(item.order_id);
        const relevant = disputes.filter(
            (d) => d.order_item_id === item.id || d.order_item_id === null
        );

        if (relevant.some((d) => OPEN_DISPUTE_STATUSES.includes(d.status))) {
            summary.frozen += 1;
            continue;
        }

        const closedByRefund = relevant.some(
            (d) => d.status === "resolved" && REFUND_RESOLUTIONS.includes(d.resolution)
        );

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            if (closedByRefund) {
                await walletRepository.markItemReleased(item.id, connection);
                await connection.commit();
                summary.closedByDispute += 1;
                continue;
            }

            await walletRepository.ensureWallet(item.seller_id, connection);
            await walletRepository.getWalletForUpdate(item.seller_id, connection);

            const netAmount = Number(item.seller_net_amount);
            await walletRepository.incrementHeldBalance(item.seller_id, -netAmount, connection);
            const balanceAfter = await walletRepository.incrementBalance(item.seller_id, netAmount, connection);
            await walletRepository.markItemReleased(item.id, connection);

            await walletRepository.insertTransaction({
                sellerId: item.seller_id,
                type: "credit",
                amount: netAmount,
                balanceAfter,
                referenceType: "escrow_release",
                referenceId: item.order_id,
                description: `Held earnings released for order #${item.order_id}`
            }, connection);

            await connection.commit();

            summary.released += 1;
            summary.amountReleased = Number((summary.amountReleased + netAmount).toFixed(2));
            releasedSellerIds.add(item.seller_id);

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    for (const sellerId of releasedSellerIds) {
        notificationService.notify({
            userId: sellerId,
            type: "wallet_release",
            titleKey: "notifications.wallet.released.title",
            messageKey: "notifications.wallet.released.message",
            withEmail: false
        }).catch((err) => console.error("wallet release notify error:", err));
    }

    return summary;
};

// Called by jobs/escrowRelease.job.js. Scans every held, credited,
// unreleased item whose order is delivered and past
// settings.escrow_hold_days, and releases whatever the dispute rule
// above allows.
exports.releaseEligibleEarnings = async () => {
    const holdDays = await settingsService.getEscrowHoldDays();
    const items = await walletRepository.findReleasableItems(holdDays);
    return releaseItems(items);
};

// Admin manual early release for one order (docs/ESCROW_ANALYSIS.md
// section 3.4 - e.g. a buyer has confirmed receipt, or an admin wants to
// close out a stale/edge-case order). Bypasses the delivered/hold-days
// timing gate entirely, but still respects the dispute-freeze rule above
// - an admin can't use this to release funds out from under an open
// dispute.
exports.releaseOrderEarnings = async (orderId) => {
    const items = await walletRepository.findReleasableItemsForOrder(orderId);
    if (items.length === 0) {
        throw new Error("No held earnings are eligible for release on this order");
    }
    return releaseItems(items);
};

exports.requestWithdrawal = async (sellerId, amount, payoutMethod, payoutDetails) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await walletRepository.ensureWallet(sellerId, connection);
        const wallet = await walletRepository.getWalletForUpdate(sellerId, connection);

        if (Number(amount) <= 0) {
            throw new Error("Withdrawal amount must be greater than zero");
        }

        if (Number(amount) > Number(wallet.balance)) {
            throw new Error("Withdrawal amount exceeds your wallet balance");
        }

        const balanceAfter = await walletRepository.incrementBalance(sellerId, -Number(amount), connection);

        const withdrawalId = await walletRepository.createWithdrawal(
            sellerId, amount, payoutMethod, payoutDetails, connection
        );

        await walletRepository.insertTransaction({
            sellerId,
            type: "debit",
            amount,
            balanceAfter,
            referenceType: "withdrawal",
            referenceId: withdrawalId,
            description: `Withdrawal request #${withdrawalId} (${payoutMethod})`
        }, connection);

        await connection.commit();

        // Fire-and-forget, after commit - fraud flagging is advisory and
        // must never delay or block a legitimate withdrawal.
        fraudService.evaluateWithdrawal(sellerId, amount)
            .catch((err) => console.error("[fraud] withdrawal evaluation failed:", err.message));

        return { withdrawalId, balance: balanceAfter };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

exports.getMyWithdrawals = async (sellerId) => {
    return walletRepository.findWithdrawalsBySeller(sellerId);
};

// ---- Admin ------------------------------------------------------------------

exports.listAllWithdrawals = async () => {
    return walletRepository.findAllWithdrawals();
};

// Approving/rejecting/marking-paid doesn't move money by itself - the debit
// already happened when the request was created (see requestWithdrawal), so
// a rejection has to refund the seller's wallet.
exports.processWithdrawal = async (withdrawalId, action, adminNote) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const withdrawal = await walletRepository.findWithdrawalById(withdrawalId, connection);

        if (!withdrawal) {
            throw new Error("Withdrawal request not found");
        }

        if (withdrawal.status !== "pending" && !(withdrawal.status === "approved" && action === "paid")) {
            throw new Error(`This request is already "${withdrawal.status}"`);
        }

        const nextStatus = { approve: "approved", reject: "rejected", paid: "paid" }[action];
        if (!nextStatus) {
            throw new Error("Invalid action");
        }

        if (action === "reject") {
            // Refund the seller's wallet since the amount was deducted upfront.
            const balanceAfter = await walletRepository.incrementBalance(
                withdrawal.seller_id, Number(withdrawal.amount), connection
            );

            await walletRepository.insertTransaction({
                sellerId: withdrawal.seller_id,
                type: "credit",
                amount: withdrawal.amount,
                balanceAfter,
                referenceType: "withdrawal",
                referenceId: withdrawal.id,
                description: `Withdrawal request #${withdrawal.id} rejected - amount refunded`
            }, connection);
        }

        await walletRepository.updateWithdrawalStatus(withdrawalId, nextStatus, adminNote, connection);

        await connection.commit();

        notificationService.notify({
            userId: withdrawal.seller_id,
            type: "withdrawal_status",
            titleKey: "notifications.withdrawal.status.title",
            titleParams: { status: nextStatus },
            messageKey: action === "reject" ? "notifications.withdrawal.rejected.message" : "notifications.withdrawal.status.message",
            messageParams: {
                amount: withdrawal.amount,
                status: nextStatus,
                note: adminNote ? { key: "notifications.withdrawal.note", params: { note: adminNote } } : ""
            },
            withEmail: true
        }).catch((err) => console.error("withdrawal notify error:", err));

        return { status: nextStatus };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};
