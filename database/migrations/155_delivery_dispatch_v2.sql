-- Migration 155: delivery dispatch v2 (seller pin, drop-off-aware ranking,
-- made-to-order "ready" state).
-- Run after 154_cart_limits_structured_payouts.sql.
--
--  seller_profiles
--    pickup_pin_verified_at  - set when the seller confirmed the pin from a
--                              device GPS fix with accuracy <= 100 m.
--                              NULL = pin placed by hand (still usable) or
--                              not set at all.
--    pickup_accuracy_m       - GPS accuracy (metres) reported with that pin.
--
--  orders
--    fulfilment_state        - made-to-order lifecycle: 'awaiting_ready'
--                              (item still being made) -> 'ready'. NULL for
--                              standard orders. Dispatch never starts for a
--                              pre_order that is not 'ready'.
--    ready_at                - when the seller marked the item ready (UTC).
--    ready_reminder_sent_at  - the "due tomorrow" reminder was sent.
--    overdue_notified_at     - the "overdue" escalation was sent.
--
--  delivery_offers (ranking audit trail + what the agent saw)
--    dropoff_distance_km, trip_minutes, payout_quote, score, radius_index
--
-- Existing pre-orders are backfilled: if the seller had already requested
-- the balance (balance_requested_at), the item counts as ready from that
-- moment; otherwise awaiting_ready.
--
-- Safe to re-run: columns are added only when missing; the backfill only
-- touches pre-orders that have no fulfilment_state yet.

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seller_profiles'
          AND COLUMN_NAME = 'pickup_pin_verified_at') = 0,
    'ALTER TABLE seller_profiles ADD COLUMN pickup_pin_verified_at DATETIME NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seller_profiles'
          AND COLUMN_NAME = 'pickup_accuracy_m') = 0,
    'ALTER TABLE seller_profiles ADD COLUMN pickup_accuracy_m INT NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
          AND COLUMN_NAME = 'fulfilment_state') = 0,
    'ALTER TABLE orders ADD COLUMN fulfilment_state ENUM(''awaiting_ready'', ''ready'') NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
          AND COLUMN_NAME = 'ready_at') = 0,
    'ALTER TABLE orders ADD COLUMN ready_at DATETIME NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
          AND COLUMN_NAME = 'ready_reminder_sent_at') = 0,
    'ALTER TABLE orders ADD COLUMN ready_reminder_sent_at DATETIME NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
          AND COLUMN_NAME = 'overdue_notified_at') = 0,
    'ALTER TABLE orders ADD COLUMN overdue_notified_at DATETIME NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_offers'
          AND COLUMN_NAME = 'dropoff_distance_km') = 0,
    'ALTER TABLE delivery_offers ADD COLUMN dropoff_distance_km DECIMAL(8, 2) NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_offers'
          AND COLUMN_NAME = 'trip_minutes') = 0,
    'ALTER TABLE delivery_offers ADD COLUMN trip_minutes INT NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_offers'
          AND COLUMN_NAME = 'payout_quote') = 0,
    'ALTER TABLE delivery_offers ADD COLUMN payout_quote DECIMAL(10, 2) NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_offers'
          AND COLUMN_NAME = 'score') = 0,
    'ALTER TABLE delivery_offers ADD COLUMN score DECIMAL(8, 4) NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_offers'
          AND COLUMN_NAME = 'radius_index') = 0,
    'ALTER TABLE delivery_offers ADD COLUMN radius_index TINYINT UNSIGNED NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill made-to-order orders that predate this migration.
UPDATE orders
SET fulfilment_state = IF(balance_requested_at IS NULL, 'awaiting_ready', 'ready'),
    ready_at = balance_requested_at
WHERE order_type = 'pre_order' AND fulfilment_state IS NULL;
