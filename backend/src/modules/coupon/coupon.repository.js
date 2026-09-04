const db = require("../../config/db");

// Phase 1 (UI/UX remediation): single-code checkout discounts. Kept
// deliberately minimal (see migration 093's comment) - this is a
// working redemption flow, not a full promotions/campaign engine.

exports.findActiveByCode = async (code) => {
    const [rows] = await db.query(
        `SELECT * FROM coupons
         WHERE code = ? AND is_active = 1
           AND (starts_at IS NULL OR starts_at <= NOW())
           AND (expires_at IS NULL OR expires_at >= NOW())`,
        [code]
    );
    return rows[0];
};

exports.hasUserRedeemed = async (couponId, userId) => {
    const [rows] = await db.query(
        "SELECT id FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ? LIMIT 1",
        [couponId, userId]
    );
    return rows.length > 0;
};

exports.recordRedemption = async (couponId, userId, orderId, discountAmount) => {
    await db.query(
        `INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount_amount)
         VALUES (?, ?, ?, ?)`,
        [couponId, userId, orderId, discountAmount]
    );
    await db.query(
        "UPDATE coupons SET times_redeemed = times_redeemed + 1 WHERE id = ?",
        [couponId]
    );
};
