-- Price-drop badges on Saved items: the price the buyer saw when they saved
-- a product. NULL means unknown (rows saved before this migration), and the
-- Saved page shows no badge for those - a drop can't be measured without a baseline.
--
-- MySQL 8.4 has no "ADD COLUMN IF NOT EXISTS" (MariaDB-only), so the guard is
-- done with information_schema. Safe to re-run.
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wishlist_items'
          AND COLUMN_NAME = 'saved_price') = 0,
    'ALTER TABLE wishlist_items ADD COLUMN saved_price DECIMAL(12, 2) NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
