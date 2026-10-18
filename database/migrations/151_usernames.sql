-- Migration 151: user-chosen usernames shown in public places.
-- Run after 150_delivery_rates.sql.
--
--  - users.username: 3-20 chars (letters, digits, underscore, dot), unique and
--    case-insensitive (the utf8mb4_unicode_ci collation makes "Amina" and
--    "amina" the same value, so the UNIQUE index enforces it).
--  - users.username_changed_at: when the person last changed it themselves;
--    the app allows one change per 30 days. NULL = never changed (the
--    generated or first-picked name does not count as a change).
--
-- Every existing user is backfilled with a generated, unique username:
-- their first name (letters only, lower-case, at most 10) followed by their
-- user id. The id suffix is what guarantees uniqueness, and the result stays
-- within 20 characters. A first name with no usable letters becomes "user".
--
-- The column stays NULLable: accounts created by code paths that predate this
-- migration (and the backfill below) are covered, and the application always
-- generates a username on insert.
--
-- Also seeds platform_settings.username_blocklist (comma-separated words that
-- may not appear as a whole username, admin-editable). Reserved words such as
-- admin, nexora and support live in code and cannot be removed.
--
-- Safe to re-run: the columns/index are added only when missing, and the
-- backfill only touches users that have no username yet. Nothing is dropped.

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'username') = 0,
    'ALTER TABLE users ADD COLUMN username VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'username_changed_at') = 0,
    'ALTER TABLE users ADD COLUMN username_changed_at DATETIME NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill before the unique index so a failure here never leaves a
-- half-built index behind.
UPDATE users
SET username = CONCAT(
    COALESCE(NULLIF(LOWER(LEFT(REGEXP_REPLACE(COALESCE(first_name, ''), '[^A-Za-z]', ''), 10)), ''), 'user'),
    id
)
WHERE username IS NULL;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
          AND INDEX_NAME = 'uq_users_username') = 0,
    'ALTER TABLE users ADD UNIQUE INDEX uq_users_username (username)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Small configurable blocklist (whole-word match, case-insensitive).
INSERT INTO platform_settings (setting_key, setting_value)
SELECT 'username_blocklist', 'staff,moderator,official,customercare,helpdesk,payments,billing,security,verified'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE setting_key = 'username_blocklist');
