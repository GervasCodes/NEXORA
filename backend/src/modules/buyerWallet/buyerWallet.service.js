/**
 * General-purpose buyer wallet .
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
    // Min/max single top-up, shown as guidance on the wallet page. The
    // server still enforces them at top-up time; a failure to read them
    // must not break the wallet summary.
    let topUpLimits = null;
    try {
        const { minAmount, maxAmount } = await require("../settings/settings.service").getTopUpLimits();
        if (Number.isFinite(minAmount) && Number.isFinite(maxAmount)) topUpLimits = { minAmount, maxAmount };
    } catch {
        topUpLimits = null;
    }
    return { balance: Number(wallet.balance), lastTopupPhone: wallet.last_topup_phone || null, topUpLimits, transactions };
};

// Called once a top-up's payment provider confirms success (see
// payment.service.js#_handleWalletTopupWebhook, which now runs this as
// part of ONE transaction together with claiming the payment and marking
// the top-up completed - see that function's comment. `executor` lets it
// join that caller-managed transaction instead of opening its own; called
// with no executor (e.g. from a manual admin/reconciliation retry) it
// still manages its own transaction exactly as before.
exports.creditFromTopUp = async (buyerId, amount, topupId, executor) => {
    const manageOwnTransaction = !executor;
    const connection = executor || await db.getConnection();
    try {
        if (manageOwnTransaction) await connection.beginTransaction();

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

        if (manageOwnTransaction) await connection.commit();
    } catch (error) {
        if (manageOwnTransaction) await connection.rollback();
        throw error;
    } finally {
        if (manageOwnTransaction) connection.release();
    }
};

// Called synchronously from payment.service.js#initiateWalletOrderPayment
// when a buyer pays for an order out of their wallet balance. Throws if
// the balance doesn't cover it - the caller surfaces that as a normal
// checkout/payment error, same as a declined card or a failed USSD
// prompt would be.
//
// Wallet order payment atomic (Phase 2, P0): `paymentId` is stored on the
// ledger row and is what buyer_wallet_transactions.dedupe_key is built
// from for this reference type (see migration 120) - one debit per
// payment ATTEMPT, ever, which is what actually needs to be unique (a
// pre-order's deposit and balance legs share one order_id but are two
// separate payment attempts and must each be allowed to debit once).
// `executor` lets this join a caller-managed transaction that also locks
// the order row and marks it paid, so the whole "check order payable,
// debit wallet, mark order paid" sequence commits or rolls back together
// - see initiateWalletOrderPayment for why that matters.
exports.debitForOrder = async (buyerId, amount, orderId, paymentId, executor) => {
    const manageOwnTransaction = !executor;
    const connection = executor || await db.getConnection();
    try {
        if (manageOwnTransaction) await connection.beginTransaction();

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
            paymentId,
            description: `Paid for order #${orderId} from wallet balance`
        }, connection);

        if (manageOwnTransaction) await connection.commit();
        return { balanceAfter };
    } catch (error) {
        if (manageOwnTransaction) await connection.rollback();
        throw error;
    } finally {
        if (manageOwnTransaction) connection.release();
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
