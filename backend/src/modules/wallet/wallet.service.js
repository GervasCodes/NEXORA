const db = require("../../config/db");
const walletRepository = require("./wallet.repository");
const settingsService = require("../settings/settings.service");
const notificationService = require("../notification/notification.service");

// Called once an order's payment is confirmed (mobile money success, or a
// Cash on Delivery confirmation). Splits the order's line items by seller,
// applies the platform's current commission rate, and credits each
// seller's wallet with their net amount. Idempotent: only touches
// order_items rows that haven't been credited yet, so it's safe to call
// more than once for the same order.
exports.creditSellersForOrder = async (orderId) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const items = await walletRepository.findUncreditedItemsByOrder(orderId, connection);

        if (items.length === 0) {
            await connection.commit();
            return;
        }

        const commissionRate = await settingsService.getCommissionRate();

        // Group this order's uncredited items by seller so a multi-vendor
        // order results in one wallet credit (and one ledger row) per seller.
        const bySeller = new Map();
        for (const item of items) {
            const sellerSubtotal = Number(item.subtotal);
            const commissionAmount = Number((sellerSubtotal * (commissionRate / 100)).toFixed(2));
            const netAmount = Number((sellerSubtotal - commissionAmount).toFixed(2));

            await walletRepository.markItemCredited(item.id, commissionRate, commissionAmount, netAmount, connection);

            const existing = bySeller.get(item.seller_id) || 0;
            bySeller.set(item.seller_id, existing + netAmount);
        }

        for (const [sellerId, netAmount] of bySeller.entries()) {
            await walletRepository.ensureWallet(sellerId, connection);
            await walletRepository.getWalletForUpdate(sellerId, connection);

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

        await connection.commit();

        for (const sellerId of bySeller.keys()) {
            notificationService.notify({
                userId: sellerId,
                type: "wallet_credit",
                title: "Wallet credited",
                message: `Your wallet has been credited for order #${orderId}.`,
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
        transactions
    };
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
            title: `Withdrawal ${nextStatus}`,
            message: action === "reject"
                ? `Your withdrawal request of ${withdrawal.amount} was rejected and refunded to your wallet.${adminNote ? ` Note: ${adminNote}` : ""}`
                : `Your withdrawal request of ${withdrawal.amount} is now "${nextStatus}".`,
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
