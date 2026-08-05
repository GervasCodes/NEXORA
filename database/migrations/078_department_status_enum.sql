-- Migration 078: Explicit Active / Maintenance / Deactivated status for
-- departments (categories) and service categories.
--
-- Migrations 068/069 gave departments a single `is_active` boolean plus a
-- maintenance_message - but that conflates two genuinely different states:
-- "temporarily in maintenance" (still linked, shopper sees a maintenance
-- page) and "deactivated" (should disappear completely - no listing, no
-- maintenance page, not even reachable by direct link). With only
-- is_active=0/1, both looked identical in the database and the app could
-- not tell them apart - every is_active=0 department showed the
-- maintenance page.
--
-- This adds a `status` ENUM as the source of truth for that distinction.
-- `is_active` is kept in sync (1 only when status='active') so every
-- other module that already gates on categories.is_active / service_categories.is_active
-- (product.service.js, featuredStore.service.js, departmentSponsorship.service.js,
-- service.service.js) keeps working unchanged - a department that is
-- either in maintenance or deactivated should equally block new listings,
-- sponsorships, etc.
--
-- Backfill: every existing is_active=0 row is assumed to be "maintenance"
-- (that was the only offline state that existed before this migration),
-- so no currently-offline department silently becomes fully hidden as a
-- side effect of this migration - an admin has to explicitly choose
-- "Deactivate" going forward for that.
ALTER TABLE categories
    ADD COLUMN status ENUM('active', 'maintenance', 'deactivated') NOT NULL DEFAULT 'active' AFTER is_active;

UPDATE categories SET status = IF(is_active = 1, 'active', 'maintenance');

ALTER TABLE service_categories
    ADD COLUMN status ENUM('active', 'maintenance', 'deactivated') NOT NULL DEFAULT 'active' AFTER is_active;

UPDATE service_categories SET status = IF(is_active = 1, 'active', 'maintenance');
