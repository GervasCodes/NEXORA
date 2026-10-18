-- Migration 149: broadcast template type (three separate broadcast functions).
-- Run after 148_seller_badge_grace.sql.
--
-- template_type says which of the three Broadcast-page functions created the
-- row:
--   'all'       - email + SMS + WhatsApp + in-app from one subject + message
--   'messaging' - WhatsApp + SMS only (plain text, no subject)
--   'rich'      - email + in-app only (subject + rich body)
-- Every existing row stays 'all' (the column default), which is what the
-- old single-form page produced.
--
-- Safe to re-run: the column and index are added only when missing. No data
-- is dropped or rewritten.

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'broadcasts'
          AND COLUMN_NAME = 'template_type') = 0,
    'ALTER TABLE broadcasts ADD COLUMN template_type ENUM(''all'', ''messaging'', ''rich'') NOT NULL DEFAULT ''all''',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'broadcasts'
          AND INDEX_NAME = 'idx_broadcasts_template_type') = 0,
    'CREATE INDEX idx_broadcasts_template_type ON broadcasts(template_type)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
