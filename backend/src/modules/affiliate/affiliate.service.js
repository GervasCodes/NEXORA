/**
 * Affiliate/influencer program .
 *
 * SPA-friendly tracking, not server-side redirect/cookie based: a
 * landing page with ?ref=CODE calls trackClick() via the API, gets back
 * a click_token, and stores it (see the frontend's affiliate context) -
 * that token rides along in the checkout payload if an order follows,
 * the same way pickup_point_id and loyalty_points_redeemed already do
 * (see order.service.js#checkout). No cookies, no redirect endpoint.
 *
 * Commission payouts land in the affiliate's buyer wallet (Phase Q2's
 * buyerWallet module) - reused rather than building a third
 * money-holding ledger. Affiliate status is buyer-only for exactly that
 * reason: only a buyer account has a wallet to pay into.
 */

const crypto = require("crypto");
const db = require("../../config/db");
const affiliateRepository = require("./affiliate.repository");
const buyerWalletRepository = require("../buyerWallet/buyerWallet.repository");
const orderRepository = require("../order/order.repository");
const logger = require("../../utils/logger").child({ module: "affiliate" });

const ATTRIBUTION_WINDOW_DAYS = 30;
const DEFAULT_COMMISSION_RATE = 0.05;

const generateCode = () => crypto.randomBytes(3).toString("hex").toUpperCase(); // 6 chars

exports.apply = async (userId) => {
    const existing = await affiliateRepository.findByUserId(userId);
    if (existing) return existing;

    let code = generateCode();
    while (await affiliateRepository.codeExists(code)) {
        code = generateCode();
    }

    await affiliateRepository.create(userId, code);
    return affiliateRepository.findByUserId(userId);
};

exports.getDashboard = async (userId) => {
    const account = await affiliateRepository.findByUserId(userId);
    if (!account) return null;

    const [clickCount, conversions, totalEarnings] = await Promise.all([
        affiliateRepository.countClicks(userId),
        affiliateRepository.findConversionsByAffiliate(userId),
        affiliateRepository.sumEarnings(userId)
    ]);

    return { account, clickCount, conversions, totalEarnings, attributionWindowDays: ATTRIBUTION_WINDOW_DAYS };
};

// Called (unauthenticated - a visitor clicking a shared link isn't
// necessarily logged in yet) when a ?ref=CODE landing page loads.
exports.trackClick = async (code, landingPath) => {
    const account = await affiliateRepository.findByCode(code);
    if (!account) return null; // unknown/inactive code - silently ignored, not an error a visitor should see

    return affiliateRepository.recordClick(account.user_id, landingPath);
};

// Called from order.service.js#checkout, fire-and-forget, once the
// order row exists - never blocks or fails checkout itself if
// attribution can't be resolved (expired click, self-referral, etc.).
//
// Phase 6: the conversion is recorded as PENDING here and the wallet is
// NOT credited yet. Commission is on the goods subtotal (not the total with
// fees), one per buyer per click token, and it is paid by
// rewardSettlement.service.js once the order is delivered and past its
// return window.
exports.attributeOrder = async (orderId, buyerId, clickToken) => {
    if (!clickToken) return;

    try {
        const click = await affiliateRepository.findClickByToken(clickToken);
        if (!click) return;

        const ageMs = Date.now() - new Date(click.created_at).getTime();
        if (ageMs > ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000) return;

        if (click.affiliate_user_id === buyerId) return; // no self-referral commissions

        const account = await affiliateRepository.findByUserId(click.affiliate_user_id);
        if (!account || account.status !== "active") return;

        if (await affiliateRepository.hasConversionForBuyerClick(click.affiliate_user_id, buyerId, clickToken)) return;

        const order = await orderRepository.findOrderById(orderId);
        if (!order) return;

        const goodsSubtotal = await affiliateRepository.findGoodsSubtotal(orderId);
        const commissionAmount = Number((goodsSubtotal * Number(account.commission_rate)).toFixed(2));
        if (commissionAmount <= 0) return;

        try {
            await affiliateRepository.createPendingConversion({
                affiliateUserId: click.affiliate_user_id,
                orderId,
                commissionAmount,
                clickToken
            });
        } catch (error) {
            // order_id is unique: a replayed checkout hits this and is a no-op.
            if (error.code === "ER_DUP_ENTRY") return;
            throw error;
        }
    } catch (error) {
        logger.error({ err: error, orderId }, "affiliate attribution error");
    }
};

// Settlement, run inside the caller's transaction (executor) so an order's
// rewards settle or roll back together. Conditional on the status it moves
// from: a repeat call finds nothing to do.
exports.releaseConversionOn = async (conversionId, executor) => {
    const conversion = await affiliateRepository.findConversionForUpdate(conversionId, executor);
    if (!conversion || conversion.status !== "pending") return false;

    const amount = Number(conversion.commission_amount);
    await buyerWalletRepository.ensureWallet(conversion.affiliate_user_id, executor);
    const balanceAfter = await buyerWalletRepository.incrementBalance(conversion.affiliate_user_id, amount, executor);
    await buyerWalletRepository.insertTransaction({
        buyerId: conversion.affiliate_user_id,
        type: "credit",
        amount,
        balanceAfter,
        referenceType: "affiliate_commission",
        referenceId: conversion.order_id,
        description: `Affiliate commission for order #${conversion.order_id}`
    }, executor);
    await affiliateRepository.setConversionStatus(conversionId, "paid", executor);
    return true;
};

// Reverses a pending or paid conversion. A paid commission is taken back
// out of the affiliate's wallet, which can leave it negative; the wallet's
// own withdrawal rules then hold further payouts until it recovers.
exports.reverseConversionOn = async (conversionId, executor) => {
    const conversion = await affiliateRepository.findConversionForUpdate(conversionId, executor);
    if (!conversion || conversion.status === "reversed") return false;

    if (conversion.status === "paid") {
        const amount = Number(conversion.commission_amount);
        await buyerWalletRepository.ensureWallet(conversion.affiliate_user_id, executor);
        const balanceAfter = await buyerWalletRepository.incrementBalance(conversion.affiliate_user_id, -amount, executor);
        await buyerWalletRepository.insertTransaction({
            buyerId: conversion.affiliate_user_id,
            type: "debit",
            amount,
            balanceAfter,
            referenceType: "affiliate_commission_reversal",
            referenceId: conversion.order_id,
            description: `Affiliate commission reversed for order #${conversion.order_id}`
        }, executor);
    }

    await affiliateRepository.setConversionStatus(conversionId, "reversed", executor);
    return true;
};

exports.DEFAULT_COMMISSION_RATE = DEFAULT_COMMISSION_RATE;

// ---- Admin approval (Phase 6, item 7) -----------------------------------
//
// New affiliate accounts start 'pending' (migration 124). Only 'active'
// accounts earn commission (attributeOrder checks this) and only 'active'
// codes resolve (findByCode). Approve and reject are idempotent: repeating
// one returns the account as it now stands. A rejected account is set to
// 'suspended', so a rejected applicant cannot reapply on their own; an admin
// can approve them later.

exports.approve = async (userId) => {
    const changed = await affiliateRepository.setStatusIf(userId, "pending", "active");
    if (!changed) {
        const account = await affiliateRepository.findByUserId(userId);
        if (!account) throw new Error("Affiliate account not found");
        if (account.status === "active") return { account, changed: false };
        throw new Error(`This affiliate is ${account.status}, not pending`);
    }
    logger.info({ userId }, "affiliate approved");
    return { account: await affiliateRepository.findByUserId(userId), changed: true };
};

exports.reject = async (userId) => {
    const changed = await affiliateRepository.setStatusIf(userId, "pending", "suspended");
    if (!changed) {
        const account = await affiliateRepository.findByUserId(userId);
        if (!account) throw new Error("Affiliate account not found");
        if (account.status === "suspended") return { account, changed: false };
        throw new Error(`This affiliate is ${account.status}, not pending`);
    }
    logger.info({ userId }, "affiliate rejected");
    return { account: await affiliateRepository.findByUserId(userId), changed: true };
};

// ---- Admin lists (Phase 6, item 8) --------------------------------------

// Hold status shown to admins. A pending conversion is on hold until its
// order is delivered and past the return window (rewardSettlement moves it).
const HOLD_LABEL = {
    pending: "on_hold",
    paid: "released",
    reversed: "reversed"
};

exports.listAccounts = async (status) => affiliateRepository.findAccountsByStatus(status);

exports.listConversions = async () => {
    const rows = await affiliateRepository.findConversionsForAdmin();
    return rows.map((row) => ({
        ...row,
        commission_amount: Number(row.commission_amount),
        hold_status: HOLD_LABEL[row.status] || row.status,
        reversed: row.status === "reversed"
    }));
};

// ---- Minimum payout (Phase 6, item 8) -----------------------------------
//
// Minimum amount for an affiliate payout, in TZS. The buyer wallet has no
// withdrawal endpoint yet, so nothing calls this today. It is ready for the
// first payout path, which must call assertPayoutAllowed before it debits.
const MIN_PAYOUT_TZS = 10000;

exports.MIN_PAYOUT_TZS = MIN_PAYOUT_TZS;

exports.assertPayoutAllowed = ({ balance, amount }) => {
    const requested = Number(amount);
    if (!Number.isFinite(requested) || requested < MIN_PAYOUT_TZS) {
        throw new Error(`The minimum affiliate payout is ${MIN_PAYOUT_TZS} TZS`);
    }
    if (Number(balance) < requested) {
        throw new Error("Insufficient affiliate balance for this payout");
    }
};


// ---- Payout requests (Phase 6, item 8) --------------------------------------
//
// A request debits the affiliate's buyer wallet and writes a 'requested'
// payout in ONE transaction. The wallet row is locked first, so the balance
// check and the debit see the same balance, and two requests at once cannot
// both spend it. One open request per affiliate at a time. The admin then
// pays it (transfer reference recorded) or rejects it (amount returned to the
// wallet). Both are conditional on the current status: a repeat call changes
// nothing, and a paid payout can never be refunded.

const PAYOUT_METHODS = ["mobile_money", "bank"];

exports.requestPayout = async (userId, { amount, method, destination }) => {
    const requested = Number(amount);
    if (!Number.isInteger(requested)) throw new Error("Payout amount must be a whole number of TZS");
    if (!PAYOUT_METHODS.includes(method)) throw new Error("Choose mobile money or bank");
    const target = String(destination || "").trim();
    if (!target) throw new Error("Enter where the payout should be sent");

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        await buyerWalletRepository.ensureWallet(userId, connection);
        const wallet = await buyerWalletRepository.getWalletForUpdate(userId, connection);

        const account = await affiliateRepository.findByUserId(userId);
        if (!account || account.status !== "active") {
            throw new Error("Only an active affiliate can request a payout");
        }
        if (await affiliateRepository.hasOpenPayout(userId, connection)) {
            throw new Error("You already have a payout awaiting approval");
        }

        exports.assertPayoutAllowed({ balance: wallet.balance, amount: requested });

        const payoutId = await affiliateRepository.insertPayout(
            { userId, amount: requested, method, destination: target },
            connection
        );

        const balanceAfter = await buyerWalletRepository.incrementBalance(userId, -requested, connection);
        await buyerWalletRepository.insertTransaction({
            buyerId: userId,
            type: "debit",
            amount: requested,
            balanceAfter,
            referenceType: "affiliate_payout",
            referenceId: payoutId,
            description: `Affiliate payout #${payoutId} requested`
        }, connection);

        await connection.commit();
        return { payoutId, status: "requested", balance: balanceAfter };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

exports.markPayoutPaid = async (payoutId, { reference }) => {
    const ref = String(reference || "").trim();
    if (!ref) throw new Error("Enter the transfer reference before marking a payout paid");

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const payout = await affiliateRepository.findPayoutForUpdate(payoutId, connection);
        if (!payout) throw new Error("Payout not found");

        if (payout.status === "paid") {
            await connection.commit();
            return { changed: false, status: "paid" };
        }
        if (payout.status !== "requested") {
            throw new Error(`This payout is already ${payout.status}`);
        }

        await affiliateRepository.setPayoutStatusIf(payoutId, "requested", "paid", { reference: ref }, connection);
        await connection.commit();
        logger.info({ payoutId }, "affiliate payout marked paid");
        return { changed: true, status: "paid" };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

exports.rejectPayout = async (payoutId, { note }) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const payout = await affiliateRepository.findPayoutForUpdate(payoutId, connection);
        if (!payout) throw new Error("Payout not found");

        if (payout.status === "rejected") {
            await connection.commit();
            return { changed: false, status: "rejected" };
        }
        if (payout.status !== "requested") {
            throw new Error(`This payout is already ${payout.status}`);
        }

        const amount = Number(payout.amount);
        await buyerWalletRepository.ensureWallet(payout.affiliate_user_id, connection);
        await buyerWalletRepository.getWalletForUpdate(payout.affiliate_user_id, connection);
        const balanceAfter = await buyerWalletRepository.incrementBalance(payout.affiliate_user_id, amount, connection);
        await buyerWalletRepository.insertTransaction({
            buyerId: payout.affiliate_user_id,
            type: "credit",
            amount,
            balanceAfter,
            referenceType: "affiliate_payout_reversal",
            referenceId: payoutId,
            description: `Affiliate payout #${payoutId} rejected - amount returned to wallet`
        }, connection);

        await affiliateRepository.setPayoutStatusIf(payoutId, "requested", "rejected", { note: note || null }, connection);
        await connection.commit();
        logger.info({ payoutId }, "affiliate payout rejected");
        return { changed: true, status: "rejected", balance: balanceAfter };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

exports.listPayouts = async (status) => affiliateRepository.findPayoutsByStatus(status);
