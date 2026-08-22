/**
 * General-purpose buyer wallet (Phase Q2).
 *
 * A buyer can pre-load this balance via a mobile-money top-up
 * (initiated/confirmed through payment.service.js - see
 * initiateWalletTopUp/_handleWalletTopupWebhook there, same
 * initiate-now/confirm-later split every other provider payment in this
 * app uses) and then spend it at checkout by picking "wallet" as the
 * payment method (see payment.service.js#initiateWalletOrderPayment,
 * which is synchronous - a wallet debit is its own confirmation, no
 * webhook to wait for).
 */

const db = require("../../config/db");
const buyerWalletRepository = require("./buyerWallet.repository");

exports.getSummary = async (buyerId) => {
    await buyerWalletRepository.ensureWallet(buyerId);
    const [wallet, transactions] = await Promise.all([
        buyerWalletRepository.getWallet(buyerId),
        buyerWalletRepository.findTransactions(buyerId)
    ]);
    return { balance: Number(wallet.balance), transactions };
};

// Called once a top-up's payment provider confirms success (see
// payment.service.js#_handleWalletTopupWebhook).
exports.creditFromTopUp = async (buyerId, amount, topupId) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        await buyerWalletRepository.ensureWallet(buyerId, connection);
        await buyerWalletRepository.getWalletForUpdate(buyerId, connection);

        const balanceAfter = await buyerWalletRepository.incrementBalance(buyerId, amount, connection);
        await buyerWalletRepository.insertTransaction({
            buyerId,
            type: "credit",
            amount,
            balanceAfter,
            referenceType: "topup",
            referenceId: topupId,
            description: `Wallet top-up #${topupId}`
        }, connection);

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

// Called synchronously from payment.service.js#initiateWalletOrderPayment
// when a buyer pays for an order out of their wallet balance. Throws if
// the balance doesn't cover it - the caller surfaces that as a normal
// checkout/payment error, same as a declined card or a failed USSD
// prompt would be.
exports.debitForOrder = async (buyerId, amount, orderId) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        await buyerWalletRepository.ensureWallet(buyerId, connection);
        const wallet = await buyerWalletRepository.getWalletForUpdate(buyerId, connection);

        if (Number(wallet.balance) < Number(amount)) {
            throw new Error("Insufficient wallet balance");
        }

        const balanceAfter = await buyerWalletRepository.incrementBalance(buyerId, -amount, connection);
        await buyerWalletRepository.insertTransaction({
            buyerId,
            type: "debit",
            amount,
            balanceAfter,
            referenceType: "order_payment",
            referenceId: orderId,
            description: `Paid for order #${orderId} from wallet balance`
        }, connection);

        await connection.commit();
        return { balanceAfter };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

// Reverses a wallet-funded order payment back into the buyer's balance -
// called from refund.service.js when a wallet-paid order's refund
// provider is "wallet" (see refund.repository's provider enum), since
// there's no external gateway to call back for money that never left
// the platform.
exports.creditRefund = async (buyerId, amount, orderId) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        await buyerWalletRepository.ensureWallet(buyerId, connection);
        await buyerWalletRepository.getWalletForUpdate(buyerId, connection);

        const balanceAfter = await buyerWalletRepository.incrementBalance(buyerId, amount, connection);
        await buyerWalletRepository.insertTransaction({
            buyerId,
            type: "credit",
            amount,
            balanceAfter,
            referenceType: "refund",
            referenceId: orderId,
            description: `Refund for order #${orderId} credited to wallet`
        }, connection);

        await connection.commit();
        return { balanceAfter };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};
