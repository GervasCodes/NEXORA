-- Migration 152: Google sign-in / sign-up.
-- Run after 151_usernames.sql.
--
--  - users.google_sub: Google's stable account id (the "sub" claim of a
--    verified ID token). UNIQUE and nullable - NULL for every account that
--    never used Google. Matching on `sub` (not the email) is what lets a
--    returning Google user sign in even after changing their Google email.
--  - users.auth_provider: how the account was created - 'password' (the
--    default, every existing row) or 'google'. A password account that later
--    links Google keeps 'password'; only google_sub marks the link.
--
-- Google-created accounts get a random, unusable password hash, so they can
-- only sign in through Google (or after a password reset by email code).
--
-- Safe to re-run: columns/index are added only when missing. No data is
-- dropped or rewritten.

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'google_sub') = 0,
    'ALTER TABLE users ADD COLUMN google_sub VARCHAR(64) NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'auth_provider') = 0,
    'ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT ''password''',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
          AND INDEX_NAME = 'uq_users_google_sub') = 0,
    'ALTER TABLE users ADD UNIQUE INDEX uq_users_google_sub (google_sub)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
