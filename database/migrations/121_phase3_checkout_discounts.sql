-- Migration 121: Checkout, discounts, cancellation & cart (master prompt Phase 3).
-- Run after 120_wallet_escrow_cod_withdrawals.sql. Safe to re-run: every
-- column/index/enum change below is guarded or naturally idempotent.
--
--   refunds.provider             Widened to include 'malipopay_card' and
--                                'wallet' (payments.method already allows
--                                both - see constants/orderStatus.js's
--                                PAYMENT_METHODS - but this table's ENUM
--                                never did, so a refund row for either
--                                method would fail to insert). Needed now
--                                because cancelOrder's new refund-on-cancel
--                                flow (order.service.js) can hit either
--                                method, not just the dispute/return paths
--                                that happened to only have exercised the
--                                original 4 so far.
--   coupon_redemptions           UNIQUE (coupon_id, user_id) - the app-level
--                                hasUserRedeemed() check in coupon.service.js
--                                was the only thing stopping a double
--                                redemption; two concurrent checkouts could
--                                both pass it before either committed. This
--                                is the actual guarantee now; recordRedemption
--                                relies on the resulting duplicate-key error.
--   group_buy_participants.claim_locked_at
--                                Short-lived claim lock (groupBuy.service.js
--                                #claim) so a double-tap claim can't create
--                                two orders for the same participant before
--                                the first claim's order_id is written back.
--                                Self-heals after 5 minutes (see claim()) in
--                                case a crash leaves it set.

-- refunds.provider
-- (Single-quoted string literal on purpose: double quotes are identifier
-- quotes under ANSI_QUOTES sql_mode, which broke this statement.)
SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refunds' AND COLUMN_NAME = 'provider'
            AND COLUMN_TYPE NOT LIKE '%malipopay_card%') = 1,
    'ALTER TABLE refunds MODIFY COLUMN provider ENUM(''mobile_money'', ''snippe'', ''malipopay_card'', ''paypal'', ''wallet'', ''cash_on_delivery'') NOT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- coupon_redemptions.uq_coupon_redemptions_user
SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'coupon_redemptions' AND INDEX_NAME = 'uq_coupon_redemptions_user') = 0,
    'ALTER TABLE coupon_redemptions ADD UNIQUE KEY uq_coupon_redemptions_user (coupon_id, user_id)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- group_buy_participants.claim_locked_at
SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'group_buy_participants' AND COLUMN_NAME = 'claim_locked_at') = 0,
    'ALTER TABLE group_buy_participants ADD COLUMN claim_locked_at DATETIME NULL DEFAULT NULL AFTER order_id',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
