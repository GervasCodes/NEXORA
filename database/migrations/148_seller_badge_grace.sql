-- Migration 148: single "Verified Seller" badge, earned by seller KYC only.
-- Run after 147_seller_trial.sql.
--
-- seller_profiles.is_verified      = ID approved, allowed to sell. It is no
--                                    longer shown as a badge anywhere.
-- seller_profiles.is_business_verified = seller KYC (BRELA / TIN / business
--                                    licence) approved. This earns the badge.
--
-- badge_grace_until: sellers that currently show a badge only because their
-- ID was approved keep it for 30 days from this migration, then lose it
-- unless their KYC is approved. The badge rule everywhere is:
--   is_verified = 1 AND (is_business_verified = 1 OR badge_grace_until > NOW())
-- Sellers approved after this migration run get NULL (no grace, no badge
-- until KYC is approved).
--
-- Safe to re-run: the column is added only when missing, and the backfill
-- only touches sellers that have no grace value yet. No data is dropped.

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seller_profiles'
          AND COLUMN_NAME = 'badge_grace_until') = 0,
    'ALTER TABLE seller_profiles ADD COLUMN badge_grace_until DATETIME NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE seller_profiles
SET badge_grace_until = DATE_ADD(NOW(), INTERVAL 30 DAY)
WHERE is_verified = 1
  AND is_business_verified = 0
  AND badge_grace_until IS NULL;
