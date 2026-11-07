-- Migration 127: record what a cancelled department-sponsorship campaign
-- refunded (Phase 6, follow-up to item 1).
--
-- Same policy as migration 125 for product campaigns: unused paid days go
-- back to the wallet, unused credit days go back to the seller's current
-- credit period, and the amounts are stored so a repeat cancel returns the
-- original result.
--
-- Safe to re-run: each column is added only when missing.

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'department_sponsorship_campaigns'
          AND COLUMN_NAME = 'refund_amount') = 0,
    'ALTER TABLE department_sponsorship_campaigns ADD COLUMN refund_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'department_sponsorship_campaigns'
          AND COLUMN_NAME = 'credit_days_returned') = 0,
    'ALTER TABLE department_sponsorship_campaigns ADD COLUMN credit_days_returned INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'department_sponsorship_campaigns'
          AND COLUMN_NAME = 'cancelled_at') = 0,
    'ALTER TABLE department_sponsorship_campaigns ADD COLUMN cancelled_at TIMESTAMP NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
