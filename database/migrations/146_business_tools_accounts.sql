-- Migration 146: "Business tools only" accounts.
-- Run after 145_delivery_business.sql.
--
-- A business-tools-only account is a normal seller-role user who uses
-- Nexora's POS/stock tooling (migration 144) without ever listing on the
-- marketplace. It is a MODE on the account, not a separate account, so
-- converting to a full marketplace seller later is a flag flip on the same
-- user row: every POS record (stock_adjustments, offline_sales) and every
-- item is keyed to the user id and is carried over untouched.
--
--  - users.seller_mode: 'marketplace' (everyone existing, the default) or
--    'business_tools'. Only meaningful for role = 'seller'.
--  - subscription_plans.audience: which kind of account a plan is sold to.
--    Seller-subscription tiers stay 'marketplace'; commission cuts and
--    sponsorship credits mean nothing to an account that doesn't sell on
--    the marketplace, so the tools tier is its own plan with its own
--    price. Every code path that creates a subscription row checks that
--    plan audience = account mode (subscription.repository.js).
--
-- Items a tools-only account enters are ordinary products rows kept
-- is_active = FALSE (marketplace queries all filter is_active = 1), so
-- they are never publicly visible; on conversion they simply become the
-- seller's inactive products, ready to publish after approval.
--
-- The tools plan price below is a placeholder (set under the Starter tier
-- since it carries no commission or listing benefits). Admin can edit it
-- from the subscription plans screen without a deploy.
--
-- The dynamic ALTER strings use single quotes (inner quotes doubled), not
-- double quotes: servers running with ANSI_QUOTES read "..." as an
-- identifier, not a string.
--
-- Safe to re-run: columns are added only when missing, the plan is seeded
-- only when absent.

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'seller_mode') = 0,
    'ALTER TABLE users ADD COLUMN seller_mode ENUM(''marketplace'', ''business_tools'') NOT NULL DEFAULT ''marketplace''',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscription_plans'
          AND COLUMN_NAME = 'audience') = 0,
    'ALTER TABLE subscription_plans ADD COLUMN audience ENUM(''marketplace'', ''business_tools'') NOT NULL DEFAULT ''marketplace''',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO subscription_plans
    (code, name, description, price, billing_cycle, commission_rate_override,
     max_active_listings, sponsorship_credits_per_month, features, sort_order, audience)
VALUES
    ('business_tools', 'Business Tools',
     'Stock, sales and reporting tools for your business - no marketplace listing needed.',
     10000, 'monthly', NULL, NULL, 0,
     JSON_ARRAY('Stock levels and stock-count corrections', 'Record in-person sales', 'Combined sales reports', 'Upgrade to a marketplace seller any time - your history comes with you'),
     10, 'business_tools')
ON DUPLICATE KEY UPDATE code = code;
