/**
 * Affiliate/influencer program (Phase Q7).
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

    return { account, clickCount, conversions, totalEarnings };
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
exports.attributeOrder = async (orderId, buyerId, clickToken) => {
    if (!clickToken) return;

    try {
        const click = await affiliateRepository.findClickByToken(clickToken);
        if (!click) return;

        const ageMs = Date.now() - new Date(click.created_at).getTime();
        if (ageMs > ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000) return;

        if (click.affiliate_user_id === buyerId) return; // no self-referral commissions

        const existing = await affiliateRepository.findConversionByOrder(orderId);
        if (existing) return;

        const account = await affiliateRepository.findByUserId(click.affiliate_user_id);
        if (!account || account.status !== "active") return;

        const order = await orderRepository.findOrderById(orderId);
        if (!order) return;

        const commissionAmount = Number((Number(order.total_amount) * Number(account.commission_rate)).toFixed(2));
        const conversionId = await affiliateRepository.createConversion(click.affiliate_user_id, orderId, commissionAmount);

        await buyerWalletRepository.ensureWallet(click.affiliate_user_id);
        const balanceAfter = await buyerWalletRepository.incrementBalance(click.affiliate_user_id, commissionAmount);
        await buyerWalletRepository.insertTransaction({
            buyerId: click.affiliate_user_id,
            type: "credit",
            amount: commissionAmount,
            balanceAfter,
            referenceType: "affiliate_commission",
            referenceId: orderId,
            description: `Affiliate commission for order #${orderId}`
        });
        await affiliateRepository.markConversionPaid(conversionId);
    } catch (error) {
        logger.error({ err: error, orderId }, "affiliate attribution error");
    }
};

exports.DEFAULT_COMMISSION_RATE = DEFAULT_COMMISSION_RATE;
