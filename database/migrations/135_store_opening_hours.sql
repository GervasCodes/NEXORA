-- Store page signals: optional weekly opening hours shown on the public store page.
-- Shape (JSON, all days optional): {"mon":{"open":"09:00","close":"18:00"},"tue":null,...}
-- NULL means the seller hasn't set hours; the page then hides the hours line.
--
-- MySQL 8.4 has no "ADD COLUMN IF NOT EXISTS" (that is MariaDB-only syntax), so
-- the guard is done with information_schema, the same pattern as the other
-- migrations. Safe to re-run.
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seller_profiles'
          AND COLUMN_NAME = 'opening_hours') = 0,
    'ALTER TABLE seller_profiles ADD COLUMN opening_hours JSON NULL AFTER store_theme',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
