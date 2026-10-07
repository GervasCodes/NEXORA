-- Migration 123: subscription lifecycle (Phase 6).
--
-- Lifecycle on seller_subscriptions.status:
--   pending  -> active        (payment confirmed or free launch)
--   active   -> past_due      (period ended on an auto-renew plan; grace window open)
--   active   -> expired       (period ended and auto-renew was off)
--   past_due -> expired       (grace window ended)
-- Benefits are decided by subscription.repository.js#findEntitledForSeller
-- against NOW(), not by the status column, so a job running late never
-- gives or takes away a benefit by itself.
--
-- Safe to re-run: columns are added only when missing.

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seller_subscriptions'
          AND COLUMN_NAME = 'expiry_reminder_sent_at') = 0,
    'ALTER TABLE seller_subscriptions ADD COLUMN expiry_reminder_sent_at TIMESTAMP NULL AFTER cancelled_at',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seller_subscriptions'
          AND COLUMN_NAME = 'grace_ends_at') = 0,
    'ALTER TABLE seller_subscriptions ADD COLUMN grace_ends_at TIMESTAMP NULL AFTER expiry_reminder_sent_at',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seller_subscriptions'
          AND INDEX_NAME = 'idx_seller_subscriptions_lifecycle') = 0,
    'CREATE INDEX idx_seller_subscriptions_lifecycle ON seller_subscriptions (status, current_period_end)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Existing active rows already past their period end get a grace window
-- from their period end, so no seller loses access at deploy time.
UPDATE seller_subscriptions
SET status = 'past_due',
    grace_ends_at = DATE_ADD(current_period_end, INTERVAL 3 DAY)
WHERE status = 'active'
  AND current_period_end IS NOT NULL
  AND current_period_end < NOW()
  AND auto_renew = TRUE
  AND grace_ends_at IS NULL;

UPDATE seller_subscriptions
SET status = 'expired'
WHERE status = 'active'
  AND current_period_end IS NOT NULL
  AND current_period_end < NOW()
  AND auto_renew = FALSE;
