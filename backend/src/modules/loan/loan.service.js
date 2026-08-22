/**
 * Seller working-capital microloan (Phase Q2).
 *
 * A cash advance against a seller's pending (held, not-yet-released)
 * escrow balance - see docs/ESCROW_ANALYSIS.md and
 * wallet.service.js's Phase 9C/9D comments for what `held_balance`
 * actually is. The advance is instant and fee-based (no approval
 * queue): eligibility is purely mechanical (verified seller, no
 * existing active loan, requested amount within the LTV cap on their
 * current held balance).
 *
 * Repayment is automatic, not something a seller does themselves: every
 * time held_balance would normally release into withdrawable `balance`
 * (wallet.service.js's escrow release job/admin action), applyRepaymentOnRelease
 * below intercepts as much of that release as the outstanding loan
 * balance needs, before whatever's left (if anything) reaches the
 * seller's withdrawable balance.
 */

const db = require("../../config/db");
const loanRepository = require("./loan.repository");
const walletRepository = require("../wallet/wallet.repository");
const notificationService = require("../notification/notification.service");
const logger = require("../../utils/logger").child({ module: "loan" });

const FEE_RATE = 0.05; // flat 5% of the principal advanced
const MAX_LTV_RATE = 0.7; // can borrow up to 70% of current held_balance
const MIN_LOAN_AMOUNT = 10000; // TZS

const eligibleVerificationStatuses = ["approved", "not_required"];

exports.getEligibility = async (sellerId) => {
    const [verificationStatus, wallet, activeLoan] = await Promise.all([
        loanRepository.getSellerVerificationStatus(sellerId),
        walletRepository.getWallet(sellerId),
        loanRepository.findActiveLoan(sellerId)
    ]);

    const heldBalance = wallet ? Number(wallet.held_balance) : 0;
    const maxAdvance = Number((heldBalance * MAX_LTV_RATE).toFixed(2));
    const isVerified = eligibleVerificationStatuses.includes(verificationStatus);

    return {
        heldBalance,
        maxAdvance,
        feeRate: FEE_RATE,
        minAmount: MIN_LOAN_AMOUNT,
        eligible: isVerified && !activeLoan && maxAdvance >= MIN_LOAN_AMOUNT,
        ineligibleReason: !isVerified
            ? "Only verified sellers can access working-capital advances"
            : activeLoan
                ? "You already have an active advance"
                : maxAdvance < MIN_LOAN_AMOUNT
                    ? "Not enough pending (held) balance to qualify for an advance yet"
                    : null,
        activeLoan: activeLoan || null
    };
};

exports.requestLoan = async (sellerId, amount) => {
    const requested = Number(amount);
    if (!requested || requested <= 0) {
        throw new Error("Invalid advance amount");
    }

    const eligibility = await exports.getEligibility(sellerId);
    if (!eligibility.eligible) {
        throw new Error(eligibility.ineligibleReason || "You're not eligible for a working-capital advance right now");
    }
    if (requested > eligibility.maxAdvance) {
        throw new Error(`You can advance up to ${eligibility.maxAdvance} against your current held balance`);
    }
    if (requested < MIN_LOAN_AMOUNT) {
        throw new Error(`The minimum advance amount is ${MIN_LOAN_AMOUNT}`);
    }

    const feeAmount = Number((requested * FEE_RATE).toFixed(2));
    const totalRepayable = Number((requested + feeAmount).toFixed(2));

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Re-check under lock: a concurrent request or an escrow release
        // running at the same moment could otherwise change held_balance
        // out from under the eligibility check above.
        await walletRepository.ensureWallet(sellerId, connection);
        const existing = await loanRepository.findActiveLoan(sellerId, connection);
        if (existing) {
            throw new Error("You already have an active advance");
        }

        const loanId = await loanRepository.create({
            sellerId,
            principalAmount: requested,
            feeAmount,
            totalRepayable
        }, connection);

        // The advance lands directly in withdrawable balance - it's
        // money the platform is fronting the seller now, against
        // earnings it already expects to collect from held_balance
        // later (see applyRepaymentOnRelease below), not a transfer out
        // of held_balance itself.
        const balanceAfter = await walletRepository.incrementBalance(sellerId, requested, connection);
        await walletRepository.insertTransaction({
            sellerId,
            type: "credit",
            amount: requested,
            balanceAfter,
            referenceType: "loan_disbursement",
            referenceId: loanId,
            description: `Working-capital advance #${loanId} disbursed (fee: ${feeAmount}, repayable: ${totalRepayable})`
        }, connection);

        await connection.commit();

        notificationService.notify({
            userId: sellerId,
            type: "loan_disbursed",
            titleKey: "notifications.loan.disbursed.title",
            messageKey: "notifications.loan.disbursed.message",
            messageParams: { amount: requested, totalRepayable },
            withEmail: true
        }).catch((err) => logger.warn({ err, sellerId }, "loan disbursed notify error"));

        return loanRepository.findById(loanId);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

exports.getMyLoans = async (sellerId) => loanRepository.findBySeller(sellerId);

// Called from wallet.service.js right after held_balance is released
// into balance for this seller (escrow release job, or an admin's
// manual early release). Takes back as much of what's now sitting in
// `balance` as the seller's outstanding advance needs, leaving the rest
// (if any) as normal withdrawable earnings. A no-op if the seller has
// no active loan.
exports.applyRepaymentOnRelease = async (sellerId) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const loan = await loanRepository.findActiveLoan(sellerId, connection);
        if (!loan) {
            await connection.commit();
            return;
        }

        const wallet = await walletRepository.getWalletForUpdate(sellerId, connection);
        const outstanding = Number((loan.total_repayable - loan.amount_repaid).toFixed(2));
        const repayment = Number(Math.min(outstanding, Math.max(Number(wallet.balance), 0)).toFixed(2));

        if (repayment <= 0) {
            await connection.commit();
            return;
        }

        const balanceAfter = await walletRepository.incrementBalance(sellerId, -repayment, connection);
        await loanRepository.applyRepayment(loan.id, repayment, connection);
        await walletRepository.insertTransaction({
            sellerId,
            type: "debit",
            amount: repayment,
            balanceAfter,
            referenceType: "loan_repayment",
            referenceId: loan.id,
            description: `Auto-repayment toward working-capital advance #${loan.id}`
        }, connection);

        await connection.commit();

        if (repayment >= outstanding) {
            notificationService.notify({
                userId: sellerId,
                type: "loan_repaid",
                titleKey: "notifications.loan.repaid.title",
                messageKey: "notifications.loan.repaid.message",
                withEmail: false
            }).catch((err) => logger.warn({ err, sellerId }, "loan repaid notify error"));
        }
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

exports.FEE_RATE = FEE_RATE;
exports.MAX_LTV_RATE = MAX_LTV_RATE;
exports.MIN_LOAN_AMOUNT = MIN_LOAN_AMOUNT;
