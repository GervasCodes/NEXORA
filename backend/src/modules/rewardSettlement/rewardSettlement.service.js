/**
 * Settles affiliate commissions, loyalty points and referral bonuses after
 * an order is delivered and its return window has passed (Phase 6), and
 * reverses them when the order is cancelled or refunded.
 *
 * Runs hourly from jobs/rewardSettlement.job.js. Every order is settled in
 * its own transaction and every step is conditional on the state it moves
 * from, so a repeat run, a second worker, or a crash half-way through is
 * safe: the next run picks up whatever is left.
 */

const db = require("../../config/db");
const settingsService = require("../settings/settings.service");
const affiliateService = require("../affiliate/affiliate.service");
const referralService = require("../referral/referral.service");
const referralRepository = require("../referral/referral.repository");
const notificationService = require("../notification/notification.service");
const logger = require("../../utils/logger").child({ module: "rewardSettlement" });
const Sentry = require("../../config/sentry");

const MAX_ORDERS_PER_RUN = 200;

const settleOrder = async (order) => {
    const connection = await db.getConnection();
    let referralAward = null;

    try {
        await connection.beginTransaction();

        // Loyalty points are per purchase, so they are counted once on the
        // top-level order only (never on a vendor child of a split cart).
        if (order.parent_order_id === null) {
            const points = referralService.pointsForAmount(order.total_amount);
            const [update] = await connection.query(
                "UPDATE orders SET loyalty_earned_at = NOW(), loyalty_points_earned = ? WHERE id = ? AND loyalty_earned_at IS NULL",
                [points, order.id]
            );
            if (update.affectedRows === 1 && points > 0) {
                await referralRepository.addPoints(order.buyer_id, points, "earned", {
                    orderId: order.id,
                    description: `Earned from order #${order.id}`
                }, connection);
            }
        }

        const [pending] = await connection.query(
            "SELECT id FROM affiliate_conversions WHERE order_id = ? AND status = 'pending'",
            [order.id]
        );
        for (const conversion of pending) {
            await affiliateService.releaseConversionOn(conversion.id, connection);
        }

        if (order.parent_order_id === null) {
            referralAward = await awardReferralIfQualified(connection, order);
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    // Notify only after the commit, so a rolled-back award never tells the referrer.
    if (referralAward) {
        notificationService.notify({
            userId: referralAward.referrerId,
            type: "referral_bonus",
            titleKey: "notifications.referral.bonus.title",
            messageKey: "notifications.referral.bonus.message",
            messageParams: { points: referralAward.points },
            withEmail: true
        }).catch((err) => logger.warn({ err, orderId: order.id }, "referral bonus notify error"));
    }
};

// The referrer is paid once, only when the referred buyer's FIRST top-level
// order (ignoring cancelled ones) is this delivered order and reaches the
// minimum amount. If that first order falls short, no bonus is paid for it.
const awardReferralIfQualified = async (connection, order) => {
    const [[referral]] = await connection.query(
        "SELECT id, referrer_id, bonus_awarded FROM referrals WHERE referred_user_id = ? FOR UPDATE",
        [order.buyer_id]
    );
    if (!referral || referral.bonus_awarded) return null;

    const [[firstOrder]] = await connection.query(
        `SELECT id FROM orders
        WHERE buyer_id = ? AND parent_order_id IS NULL AND status <> 'cancelled'
        ORDER BY id ASC LIMIT 1`,
        [order.buyer_id]
    );
    if (!firstOrder || firstOrder.id !== order.id) return null;
    if (Number(order.total_amount) < referralService.REFERRAL_MIN_FIRST_ORDER_TZS) return null;

    const [update] = await connection.query(
        "UPDATE referrals SET bonus_awarded = 1 WHERE id = ? AND bonus_awarded = 0",
        [referral.id]
    );
    if (update.affectedRows !== 1) return null;

    const points = referralService.REFERRAL_BONUS_POINTS;
    await referralRepository.addPoints(referral.referrer_id, points, "referral_bonus", {
        description: "Referral bonus - your referred friend completed their first order"
    }, connection);

    return { referrerId: referral.referrer_id, points };
};

const reverseOrder = async (order) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [open] = await connection.query(
            "SELECT id FROM affiliate_conversions WHERE order_id = ? AND status IN ('pending', 'paid')",
            [order.id]
        );
        for (const conversion of open) {
            await affiliateService.reverseConversionOn(conversion.id, connection);
        }

        if (order.parent_order_id === null && order.loyalty_points_earned > 0 && order.loyalty_clawed_back_at === null) {
            // Take back what was earned, clamped to the buyer's current balance
            // (points may already have been spent). A shortfall is logged for
            // a human to look at rather than driving the balance negative.
            const [[user]] = await connection.query(
                "SELECT loyalty_points FROM users WHERE id = ? FOR UPDATE",
                [order.buyer_id]
            );
            const balance = Math.max(0, Number(user ? user.loyalty_points : 0));
            const earned = Number(order.loyalty_points_earned);
            const take = Math.min(earned, balance);

            if (take > 0) {
                await referralRepository.addPoints(order.buyer_id, -take, "reversed", {
                    orderId: order.id,
                    description: `Points reversed - order #${order.id} cancelled or refunded`
                }, connection);
            }
            if (take < earned) {
                logger.warn({ orderId: order.id, earned, taken: take }, "loyalty clawback short - balance already spent");
            }

            await connection.query(
                "UPDATE orders SET loyalty_clawed_back_at = NOW() WHERE id = ? AND loyalty_clawed_back_at IS NULL",
                [order.id]
            );
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

exports.settleMaturedOrders = async () => {
    const [returnWindowDays, returnWindowInsuredDays] = await Promise.all([
        settingsService.getReturnWindowDays(),
        settingsService.getReturnWindowInsuredDays()
    ]);

    const [orders] = await db.query(
        `SELECT o.id, o.buyer_id, o.parent_order_id, o.total_amount, o.loyalty_earned_at
        FROM orders o
        JOIN deliveries d ON d.order_id = o.id
        WHERE o.status = 'delivered'
            AND o.total_refunded = 0
            AND d.delivered_at IS NOT NULL
            AND d.delivered_at <= NOW() - INTERVAL IF(o.buyer_protection_addon, ?, ?) DAY
            AND (
                (o.parent_order_id IS NULL AND o.loyalty_earned_at IS NULL)
                OR EXISTS (SELECT 1 FROM affiliate_conversions ac WHERE ac.order_id = o.id AND ac.status = 'pending')
                OR (o.parent_order_id IS NULL AND EXISTS (
                    SELECT 1 FROM referrals r WHERE r.referred_user_id = o.buyer_id AND r.bonus_awarded = 0
                ))
            )
        ORDER BY o.id ASC
        LIMIT ?`,
        [Number(returnWindowInsuredDays), Number(returnWindowDays), MAX_ORDERS_PER_RUN]
    );

    let settled = 0;
    for (const order of orders) {
        try {
            await settleOrder(order);
            settled++;
        } catch (error) {
            logger.error({ err: error, orderId: order.id }, "reward settlement failed for order");
            Sentry.captureException(error, { tags: { area: "rewards", stage: "settle" }, extra: { orderId: order.id } });
        }
    }
    return settled;
};

exports.reverseOrder = reverseOrder;

exports.reverseVoidedOrders = async () => {
    const [orders] = await db.query(
        `SELECT o.id, o.buyer_id, o.parent_order_id, o.loyalty_points_earned, o.loyalty_clawed_back_at
        FROM orders o
        WHERE (o.status = 'cancelled' OR o.total_refunded > 0)
            AND (
                EXISTS (SELECT 1 FROM affiliate_conversions ac WHERE ac.order_id = o.id AND ac.status IN ('pending', 'paid'))
                OR (o.loyalty_earned_at IS NOT NULL AND o.loyalty_clawed_back_at IS NULL AND o.loyalty_points_earned > 0)
            )
        ORDER BY o.id ASC
        LIMIT ?`,
        [MAX_ORDERS_PER_RUN]
    );

    let reversed = 0;
    for (const order of orders) {
        try {
            await reverseOrder(order);
            reversed++;
        } catch (error) {
            logger.error({ err: error, orderId: order.id }, "reward reversal failed for order");
            Sentry.captureException(error, { tags: { area: "rewards", stage: "reverse" }, extra: { orderId: order.id } });
        }
    }
    return reversed;
};
