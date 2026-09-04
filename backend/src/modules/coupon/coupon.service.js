const couponRepository = require("./coupon.repository");

const normalizeCode = (code) => String(code || "").trim().toUpperCase();

// Shared by both the standalone "Apply" button in Checkout.jsx (validate
// only) and order.service.js#checkout (quote as part of placing the
// order) - both need exactly the same eligibility checks and discount
// math, so this is the one place that computes it. Mirrors
// referral.service.js#quoteRedemption's pattern (a pure "would this be
// valid, and for how much" quote, separate from actually committing it)
// for the same reason: a checkout that fails after this point should
// never have burned the coupon's redemption.
exports.quote = async (rawCode, userId, subtotal) => {
    if (!rawCode) {
        return { coupon: null, discountAmount: 0 };
    }

    const code = normalizeCode(rawCode);
    const coupon = await couponRepository.findActiveByCode(code);

    if (!coupon) {
        throw new Error("This code isn't valid or has expired");
    }

    if (coupon.max_redemptions !== null && coupon.times_redeemed >= coupon.max_redemptions) {
        throw new Error("This code has already been fully redeemed");
    }

    const alreadyUsed = await couponRepository.hasUserRedeemed(coupon.id, userId);
    if (alreadyUsed) {
        throw new Error("You've already used this code");
    }

    if (subtotal < Number(coupon.min_order_amount)) {
        throw new Error(`This code needs a minimum order of ${coupon.min_order_amount}`);
    }

    let discountAmount = coupon.discount_type === "percent"
        ? subtotal * (Number(coupon.discount_value) / 100)
        : Number(coupon.discount_value);

    if (coupon.max_discount_amount !== null) {
        discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount));
    }

    // A discount can never exceed the subtotal it's discounting - keeps
    // a very large fixed-amount code from producing a negative order
    // total.
    discountAmount = Number(Math.min(discountAmount, subtotal).toFixed(2));

    return { coupon, discountAmount };
};

// Read-only check for the frontend's "Apply" button - same validity
// rules as quote() above, without needing a real checkout in progress.
exports.validate = async (rawCode, userId, subtotal) => {
    const { coupon, discountAmount } = await exports.quote(rawCode, userId, subtotal);
    return {
        code: coupon.code,
        discountType: coupon.discount_type,
        discountValue: Number(coupon.discount_value),
        discountAmount
    };
};

// Called only after the order row genuinely exists - see this module's
// callers in order.service.js, which follow the same
// quote-then-commit-after-creation sequencing already used for loyalty
// points redemption.
exports.commitRedemption = async (couponId, userId, orderId, discountAmount) => {
    if (!couponId) return;
    await couponRepository.recordRedemption(couponId, userId, orderId, discountAmount);
};
