-- Migration 125: record what a cancelled product-sponsorship campaign
-- refunded (Phase 6, item 1).
--
-- Cancelling refunds unused paid days to the seller's wallet and returns
-- unused included credit days to the seller's current credit period. The
-- amounts are stored on the campaign so a repeated cancel request can
-- return the original result instead of refunding again.
--
-- Safe to re-run: each column is added only when missing.

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sponsorship_campaigns'
          AND COLUMN_NAME = 'refund_amount') = 0,
    'ALTER TABLE sponsorship_campaigns ADD COLUMN refund_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sponsorship_campaigns'
          AND COLUMN_NAME = 'credit_days_returned') = 0,
    'ALTER TABLE sponsorship_campaigns ADD COLUMN credit_days_returned INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sponsorship_campaigns'
          AND COLUMN_NAME = 'cancelled_at') = 0,
    'ALTER TABLE sponsorship_campaigns ADD COLUMN cancelled_at TIMESTAMP NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
