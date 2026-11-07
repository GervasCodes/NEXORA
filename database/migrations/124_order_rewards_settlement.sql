-- Migration 124: affiliate commissions, loyalty points and referral bonuses
-- settle after delivery and the return window, not at payment (Phase 6).
--
-- Safe to re-run: every column is added only when missing, and the
-- backfill only touches rows that have not been settled yet.

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
          AND COLUMN_NAME = 'loyalty_points_earned') = 0,
    'ALTER TABLE orders ADD COLUMN loyalty_points_earned INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
          AND COLUMN_NAME = 'loyalty_earned_at') = 0,
    'ALTER TABLE orders ADD COLUMN loyalty_earned_at TIMESTAMP NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
          AND COLUMN_NAME = 'loyalty_clawed_back_at') = 0,
    'ALTER TABLE orders ADD COLUMN loyalty_clawed_back_at TIMESTAMP NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'affiliate_conversions'
          AND COLUMN_NAME = 'click_token') = 0,
    'ALTER TABLE affiliate_conversions ADD COLUMN click_token VARCHAR(64) NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Conversions can now be reversed as well as pending or paid.
ALTER TABLE affiliate_conversions
    MODIFY COLUMN status ENUM('pending', 'paid', 'reversed') NOT NULL DEFAULT 'pending';

-- New affiliate applications wait for admin approval. Existing accounts keep
-- whatever status they already have.
ALTER TABLE affiliate_accounts
    MODIFY COLUMN status ENUM('pending', 'active', 'suspended') NOT NULL DEFAULT 'pending';

-- Orders already paid earned their points and bonuses under the old rule
-- (at payment). Mark them settled so the new delivery-time job never pays
-- them a second time.
UPDATE orders
SET loyalty_earned_at = COALESCE(updated_at, NOW())
WHERE loyalty_earned_at IS NULL
  AND payment_status IN ('paid', 'deposit_paid');
