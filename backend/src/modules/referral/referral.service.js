/**
 * Referral & loyalty points program .
 *
 * Referral: every user gets a referral_code at signup. Sharing it and
 * having someone register with it links a `referrals` row. The referrer's
 * one-time bonus is paid by rewardSettlement.service.js once the referred
 * user's first qualifying order is delivered and past its return window
 * (Phase 6), never at payment.
 *
 * Loyalty: points are earned on delivered orders once the return window
 * has passed (see rewardSettlement.service.js). They are redeemable at
 * checkout as a discount on a later order - see quoteRedemption and
 * commitRedemption, called from order.service.js#checkout.
 */

const crypto = require("crypto");
const referralRepository = require("./referral.repository");
const notificationService = require("../notification/notification.service");
const logger = require("../../utils/logger").child({ module: "referral" });

const REFERRAL_BONUS_POINTS = 200;
// The referred user's first top-level order must reach this amount (TZS)
// before the referrer is paid. Below it, no bonus is paid for that referral.
const REFERRAL_MIN_FIRST_ORDER_TZS = 20000;
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

// Points for a settled order amount: 1 point per 1,000 TZS. Used by
// rewardSettlement.service.js, never at payment time.
exports.pointsForAmount = (amount) => Math.floor(Number(amount) / 1000) * POINTS_PER_1000_SPENT;

exports.getMyLoyaltyStatus = async (userId) => {
    const [balance, ledger, referrals] = await Promise.all([
        referralRepository.getBalance(userId),
        referralRepository.findLedger(userId),
        referralRepository.findMyReferrals(userId)
    ]);
    return { balance, ledger, referrals, pointValueTzs: POINT_VALUE_TZS, referralBonusPoints: REFERRAL_BONUS_POINTS, pointsPer1000Spent: POINTS_PER_1000_SPENT };
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

// Called from order.repository.js#createOrder/createSplitOrder (Phase 3) -
// now runs INSIDE the order's own creation transaction (executor is the
// transaction connection, not the default pool) so a checkout that fails
// after this point rolls the points deduction back along with everything
// else, and the race-safe guard in addPoints applies before the order
// that spent these points is ever visible to anyone.
exports.commitRedemption = async (userId, pointsToRedeem, orderId, executor) => {
    if (!pointsToRedeem || pointsToRedeem <= 0) return;
    await referralRepository.addPoints(userId, -pointsToRedeem, "redeemed", {
        orderId,
        description: "Redeemed at checkout"
    }, executor);
};

// Cancel a paid order, or a stale/unpaid order expiring (Phase 3) - gives
// back points a buyer redeemed at checkout, since the order they were
// spent on never completed. executor lets order.service.js run this
// inside cancelOrder's own guarded flow when useful; defaults to the bare
// pool otherwise (no multi-step transaction needed for a plain credit).
exports.reverseRedemption = async (userId, pointsToGiveBack, orderId, executor) => {
    if (!pointsToGiveBack || pointsToGiveBack <= 0) return;
    await referralRepository.addPoints(userId, pointsToGiveBack, "reversed", {
        orderId,
        description: `Order #${orderId} cancelled - points returned`
    }, executor);
};

exports.POINT_VALUE_TZS = POINT_VALUE_TZS;
exports.REFERRAL_BONUS_POINTS = REFERRAL_BONUS_POINTS;
exports.REFERRAL_MIN_FIRST_ORDER_TZS = REFERRAL_MIN_FIRST_ORDER_TZS;
