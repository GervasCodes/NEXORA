-- Public "Call" button on store and service pages. Separate from
-- business_phone (private account contact): a seller publishes this number
-- only by filling it in. NULL = no call button shown.
--
-- MySQL 8.4 has no "ADD COLUMN IF NOT EXISTS" (MariaDB-only), so the guard is
-- done with information_schema. Safe to re-run.
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seller_profiles'
          AND COLUMN_NAME = 'public_phone') = 0,
    'ALTER TABLE seller_profiles ADD COLUMN public_phone VARCHAR(20) NULL AFTER social_whatsapp',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
