-- Migration 126: at most one active department sponsorship campaign per
-- seller and department (Phase 6, item 2).
--
-- The application check in departmentSponsorship.service.js is now run
-- inside the campaign transaction, after the wallet lock. This migration
-- adds the database guarantee behind it.
--
-- VIRTUAL (not STORED) on purpose: adding a STORED generated column forces a
-- full table rebuild, which fails with "Cannot add foreign key constraint"
-- (errno 1215) on department_sponsorship_campaigns because it carries
-- foreign keys with ON DELETE CASCADE. A VIRTUAL column is added without a
-- rebuild, and InnoDB still supports the UNIQUE key on it.
-- Steps:
--   1. Add a log table for what the backfill changed.
--   2. Add two generated columns that hold seller_id and category_id only
--      while a campaign is 'active'. A UNIQUE key on them allows many
--      expired or cancelled rows but only one active row per seller and
--      department (MySQL has no partial indexes, so this is the usual way
--      to express one).
--   3. Backfill: for any seller and department with more than one active
--      campaign, keep the newest and end the rest. Anything still active
--      with ends_at in the past is ended too, since the expiry sweep would
--      end it anyway. Every change is logged.
--   4. Add the UNIQUE key (only after the backfill, so it cannot fail).
--
-- Safe to re-run: every DDL step checks information_schema first, and the
-- backfill only touches rows still marked 'active'.

CREATE TABLE IF NOT EXISTS department_sponsorship_dedupe_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    campaign_id INT NOT NULL,
    seller_id INT NOT NULL,
    category_id INT NOT NULL,
    kept_campaign_id INT NULL,
    action VARCHAR(40) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dsc_dedupe_log_campaign (campaign_id)
);

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'department_sponsorship_campaigns'
          AND COLUMN_NAME = 'active_seller_id') = 0,
    'ALTER TABLE department_sponsorship_campaigns ADD COLUMN active_seller_id INT GENERATED ALWAYS AS (IF(status = ''active'', seller_id, NULL)) VIRTUAL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'department_sponsorship_campaigns'
          AND COLUMN_NAME = 'active_category_id') = 0,
    'ALTER TABLE department_sponsorship_campaigns ADD COLUMN active_category_id INT GENERATED ALWAYS AS (IF(status = ''active'', category_id, NULL)) VIRTUAL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Log the rows the backfill is about to end (kept = newest active row per
-- seller and department).
INSERT INTO department_sponsorship_dedupe_log
    (campaign_id, seller_id, category_id, kept_campaign_id, action)
SELECT dsc.id, dsc.seller_id, dsc.category_id, keep.keep_id, 'duplicate_active_ended'
FROM department_sponsorship_campaigns dsc
JOIN (
    SELECT seller_id, category_id, MAX(id) AS keep_id
    FROM department_sponsorship_campaigns
    WHERE status = 'active'
    GROUP BY seller_id, category_id
    HAVING COUNT(*) > 1
) keep ON keep.seller_id = dsc.seller_id AND keep.category_id = dsc.category_id
WHERE dsc.status = 'active' AND dsc.id <> keep.keep_id;

UPDATE department_sponsorship_campaigns dsc
JOIN (
    SELECT seller_id, category_id, MAX(id) AS keep_id
    FROM department_sponsorship_campaigns
    WHERE status = 'active'
    GROUP BY seller_id, category_id
    HAVING COUNT(*) > 1
) keep ON keep.seller_id = dsc.seller_id AND keep.category_id = dsc.category_id
SET dsc.status = 'expired',
    dsc.ends_at = LEAST(dsc.ends_at, NOW())
WHERE dsc.status = 'active' AND dsc.id <> keep.keep_id;

-- Active rows whose end date has already passed: log and expire them, so
-- the unique key cannot collide with a new campaign while the cron is due.
INSERT INTO department_sponsorship_dedupe_log
    (campaign_id, seller_id, category_id, kept_campaign_id, action)
SELECT id, seller_id, category_id, NULL, 'stale_active_expired'
FROM department_sponsorship_campaigns
WHERE status = 'active' AND ends_at <= NOW();

UPDATE department_sponsorship_campaigns
SET status = 'expired'
WHERE status = 'active' AND ends_at <= NOW();

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'department_sponsorship_campaigns'
          AND INDEX_NAME = 'uq_dsc_single_active') = 0,
    'ALTER TABLE department_sponsorship_campaigns ADD UNIQUE KEY uq_dsc_single_active (active_seller_id, active_category_id)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
