const db = require("../../config/db");

// (UI/UX remediation): single-code checkout discounts. Kept
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

// Coupon and points integrity (Phase 3, P0). Two race guards, in order:
//   1. The UPDATE only succeeds while there's still redemption headroom
//      (max_redemptions IS NULL, i.e. unlimited, or times_redeemed hasn't
//      caught up to it yet) - previously an unconditional += that let two
//      concurrent checkouts both redeem the very last slot.
//   2. uq_coupon_redemptions_user (migration 121) is what actually
//      enforces "one redemption per buyer" now, not the app-level
//      hasUserRedeemed() precheck in coupon.service.js#quote (which is
//      still useful as a fast, friendly check before checkout even
//      starts, just not as the real guarantee). A duplicate-key hit here
//      means this call lost that race - roll back the counter increment
//      it just made, since it didn't actually win the slot.
// executor defaults to the bare pool, but order.repository.js now always
// passes its own transaction connection so this runs inside the same
// transaction as the order it belongs to.
exports.recordRedemption = async (couponId, userId, orderId, discountAmount, executor = db) => {
    const [couponResult] = await executor.query(
        `UPDATE coupons
        SET times_redeemed = times_redeemed + 1
        WHERE id = ? AND (max_redemptions IS NULL OR times_redeemed < max_redemptions)`,
        [couponId]
    );
    if (couponResult.affectedRows === 0) {
        throw new Error("This code has just reached its redemption limit - please try again without it");
    }

    try {
        await executor.query(
            `INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount_amount)
             VALUES (?, ?, ?, ?)`,
            [couponId, userId, orderId, discountAmount]
        );
    } catch (err) {
        if (err && (err.code === "ER_DUP_ENTRY" || err.errno === 1062)) {
            await executor.query("UPDATE coupons SET times_redeemed = times_redeemed - 1 WHERE id = ?", [couponId]);
            throw new Error("You've already used this code");
        }
        throw err;
    }
};

// Cancel a paid order, or a stale/unpaid order expiring (Phase 3) - frees
// the code back up for this buyer to use again, since the order it was
// applied to never completed. A no-op if this order never redeemed a
// coupon in the first place.
exports.reverseRedemption = async (orderId, executor = db) => {
    const [rows] = await executor.query(
        "SELECT coupon_id FROM coupon_redemptions WHERE order_id = ?",
        [orderId]
    );
    if (!rows.length) return;

    await executor.query("DELETE FROM coupon_redemptions WHERE order_id = ?", [orderId]);
    await executor.query(
        "UPDATE coupons SET times_redeemed = GREATEST(times_redeemed - 1, 0) WHERE id = ?",
        [rows[0].coupon_id]
    );
};
