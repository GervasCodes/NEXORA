-- Migration 147: automatic 7-day seller trial.
-- Run after 146_business_tools_accounts.sql.
--
-- Every seller-role account gets one free trial. The columns live on
-- `users` (not seller_profiles) because a business-tools-only account
-- (migration 146) never has a seller_profiles row, yet it is a seller too
-- and must get the same trial.
--
--  - trial_started_at / trial_ends_at: the trial window. A non-NULL
--    trial_started_at means the trial was used - there is no second one.
--  - trial_reminder_stage: how far the lifecycle job has notified the
--    seller (0 = nothing, 1 = day-5, 2 = day-7, 3 = expired), so each
--    notification is sent exactly once.
--
-- Every existing seller gets a fresh 7-day trial starting when this
-- migration runs. Buyers, delivery agents and admins are untouched.
-- The old monetization_* settings rows and the monetization_schedule
-- table are left in place (no longer read).
--
-- Safe to re-run: columns are added only when missing, and the backfill
-- only touches sellers that have no trial yet.

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'trial_started_at') = 0,
    'ALTER TABLE users ADD COLUMN trial_started_at DATETIME NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'trial_ends_at') = 0,
    'ALTER TABLE users ADD COLUMN trial_ends_at DATETIME NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'trial_reminder_stage') = 0,
    'ALTER TABLE users ADD COLUMN trial_reminder_stage TINYINT UNSIGNED NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
          AND INDEX_NAME = 'idx_users_trial_ends_at') = 0,
    'CREATE INDEX idx_users_trial_ends_at ON users (trial_ends_at)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE users
SET trial_started_at = NOW(),
    trial_ends_at = NOW() + INTERVAL 7 DAY
WHERE role = 'seller' AND trial_ends_at IS NULL AND trial_started_at IS NULL;
