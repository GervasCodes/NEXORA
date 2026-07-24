-- Migration 053: department_sponsorship_campaigns (Phase 8C - Department
-- Sponsorship)
-- Depends on: users (001), categories (004/040), platform_settings (017)
-- Additive only.
--
-- Phase 1B/1C's homepage department grid (category.service.js#listDepartments,
-- rendered by DepartmentCard.jsx on Home.jsx) has always ordered departments
-- organically by categories.display_order (admin-set, migration 040), then
-- name. This phase makes a department's position in that grid purchasable:
-- a seller with at least one active product in a department can pay out of
-- their own wallet balance (seller_wallets - migration 017,
-- wallet.repository.js) to have that department bumped to the front of the
-- homepage grid for a fixed number of days at the platform's current daily
-- rate. This is the broadest of the three placement tiers this project
-- adds - Sponsored Products (migration 051, Phase 8A) promotes one product
-- inside a department's own page, Featured Stores (migration 052, Phase 8B)
-- promotes one seller's storefront inside a department's own page, and this
-- promotes the department itself on the homepage, before a shopper has
-- picked a department at all.
--
-- A department isn't owned by any one seller - several different sellers
-- selling in "Phones & Electronics" could each independently pay to
-- sponsor it. So, like store_featured_campaigns (migration 052) and unlike
-- products.is_sponsored (migration 051), there is no boolean flag column
-- to flip on categories itself. Instead
-- category.repository.js#findAllActiveWithSponsorship LEFT JOINs this table
-- live, scoped to `status = 'active' AND ends_at > NOW()`, and treats a
-- department as sponsored if *any* seller currently has a running campaign
-- for it - ranked ahead of the organic display_order/name ordering. Nothing
-- to keep in sync: starting, cancelling, or expiring a campaign only ever
-- touches that one row's `status`, the same reasoning migration 052's
-- header gives for store_featured_campaigns.
--
-- `daily_rate` and `total_cost` are snapshotted at creation time (same
-- reasoning as sponsorship_campaigns.daily_rate / store_featured_campaigns.
-- daily_rate - a later admin rate change must never rewrite what a seller
-- already paid for a past campaign). `status` starts 'active' and is
-- flipped to 'expired' by the departmentSponsorshipExpiry cron job once
-- `ends_at` passes, or to 'cancelled' if a seller cancels early (no refund
-- - same policy as sponsorship.service.js#cancelCampaign and
-- featuredStore.service.js#cancelCampaign). `seller_id` references
-- `users(id)` directly, same convention every other seller-owned table in
-- this schema already uses.
CREATE TABLE IF NOT EXISTS department_sponsorship_campaigns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    category_id INT NOT NULL,

    daily_rate DECIMAL(12, 2) NOT NULL,
    days INT NOT NULL,
    total_cost DECIMAL(12, 2) NOT NULL,

    status ENUM('active', 'expired', 'cancelled') NOT NULL DEFAULT 'active',

    starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ends_at DATETIME NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_department_sponsorship_campaigns_seller
        FOREIGN KEY (seller_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_department_sponsorship_campaigns_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE CASCADE,

    INDEX idx_department_sponsorship_campaigns_seller (seller_id),
    INDEX idx_department_sponsorship_campaigns_category_status_ends (category_id, status, ends_at),
    INDEX idx_department_sponsorship_campaigns_status_ends (status, ends_at)
);

-- Flat daily cost (TZS) a seller pays to sponsor an entire department on
-- the homepage grid, same key/value row shape every other platform_settings
-- entry uses (see migration 017). Read by
-- settingsService.getDepartmentSponsorshipDailyRate(), edited by admins via
-- the existing PUT /admin/settings. Priced above featured_store_daily_rate
-- (migration 052) by default since it's homepage-wide visibility rather
-- than a placement within a department a shopper has already opened.
INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('department_sponsorship_daily_rate', '12000')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
