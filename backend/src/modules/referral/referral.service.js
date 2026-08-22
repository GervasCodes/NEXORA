/**
 * Referral & loyalty points program (Phase Q7).
 *
 * Referral: every user gets a referral_code at signup. Sharing it and
 * having someone register with it links referred_by_user_id + a
 * `referrals` row; the referrer gets a one-time bonus once (and only
 * once) the referred user completes their first paid order - see
 * maybeAwardReferralBonus, called from payment.service.js's order-paid
 * webhook handler the same fire-and-forget way EFD receipts and wallet
 * crediting already are.
 *
 * Loyalty: every completed order earns the buyer points (flat rate on
 * the amount actually charged), redeemable at checkout as a discount on
 * a later order - see redeemAtCheckout, called from
 * order.service.js#checkout the same way KYC limit enforcement and the
 * buyer-protection fee are.
 */

const crypto = require("crypto");
const referralRepository = require("./referral.repository");
const notificationService = require("../notification/notification.service");
const logger = require("../../utils/logger").child({ module: "referral" });

const REFERRAL_BONUS_POINTS = 200;
const POINTS_PER_1000_SPENT = 1; // 1 point per 1,000 TZS charged
const POINT_VALUE_TZS = 10; // each point is worth 10 TZS when redeemed

const generateCode = () => crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 chars

const uniqueReferralCode = async () => {
    let code = generateCode();
    while (await referralRepository.findByReferralCode(code)) {
        code = generateCode();
    }
    return code;
};

// Called from auth.service.js#register, inside the same transaction as
// user creation - a code is assigned unconditionally; the submitted
// code (if any) only matters for linking a referrer.
exports.setupNewUserReferral = async (userId, submittedCode, connection) => {
    const code = await uniqueReferralCode();
    await referralRepository.setReferralCode(userId, code, connection);

    if (!submittedCode) return;

    const referrer = await referralRepository.findByReferralCode(submittedCode.toUpperCase());
    if (!referrer || referrer.id === userId) return; // invalid/self-referral - silently ignored, not a hard signup error

    await referralRepository.setReferredBy(userId, referrer.id, connection);
    await referralRepository.createReferral(referrer.id, userId, connection);
};

exports.maybeAwardReferralBonus = async (buyerId) => {
    const referral = await referralRepository.findReferralByReferredUser(buyerId);
    if (!referral || referral.bonus_awarded) return;

    await referralRepository.markReferralBonusAwarded(referral.id);
    await referralRepository.addPoints(referral.referrer_id, REFERRAL_BONUS_POINTS, "referral_bonus", {
        description: "Referral bonus - your referred friend completed their first order"
    });

    notificationService.notify({
        userId: referral.referrer_id,
        type: "referral_bonus",
        titleKey: "notifications.referral.bonus.title",
        messageKey: "notifications.referral.bonus.message",
        messageParams: { points: REFERRAL_BONUS_POINTS },
        withEmail: true
    }).catch((err) => logger.warn({ err, referralId: referral.id }, "referral bonus notify error"));
};

// Called from order.service.js#checkout's order-paid webhook path (via
// payment.service.js), same fire-and-forget shape as the referral bonus
// above - earning points should never be able to block or slow down
// checkout itself.
exports.awardPointsForOrder = async (buyerId, orderId, chargedAmount) => {
    const points = Math.floor(Number(chargedAmount) / 1000) * POINTS_PER_1000_SPENT;
    if (points <= 0) return;

    await referralRepository.addPoints(buyerId, points, "earned", {
        orderId,
        description: `Earned from order #${orderId}`
    });
};

exports.getMyLoyaltyStatus = async (userId) => {
    const [balance, ledger, referrals] = await Promise.all([
        referralRepository.getBalance(userId),
        referralRepository.findLedger(userId),
        referralRepository.findMyReferrals(userId)
    ]);
    return { balance, ledger, referrals, pointValueTzs: POINT_VALUE_TZS };
};

// Called from order.service.js#checkout BEFORE the order is created, to
// validate the request and compute the discount for the order total.
// Does not deduct anything yet - see commitRedemption for that, called
// only after the order row actually exists.
exports.quoteRedemption = async (userId, pointsToRedeem) => {
    if (!pointsToRedeem || pointsToRedeem <= 0) return { pointsRedeemed: 0, discountAmount: 0 };

    const balance = await referralRepository.getBalance(userId);
    if (pointsToRedeem > balance) {
        throw new Error(`You only have ${balance} loyalty points available`);
    }

    return { pointsRedeemed: pointsToRedeem, discountAmount: pointsToRedeem * POINT_VALUE_TZS };
};

// Called from order.service.js#checkout AFTER the order row is created,
// with the exact points quoteRedemption already validated - actually
// deducts the balance and writes the ledger entry.
exports.commitRedemption = async (userId, pointsToRedeem) => {
    if (!pointsToRedeem || pointsToRedeem <= 0) return;
    await referralRepository.addPoints(userId, -pointsToRedeem, "redeemed", {
        description: "Redeemed at checkout"
    });
};

exports.POINT_VALUE_TZS = POINT_VALUE_TZS;
