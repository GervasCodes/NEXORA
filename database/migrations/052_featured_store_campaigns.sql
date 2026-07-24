-- Migration 052: store_featured_campaigns (Phase 8B - Featured Stores)
-- Depends on: users (001), categories (004), platform_settings (017)
-- Additive only.
--
-- category.repository.js#findFeaturedStoresByCategory (Phase 2C) already
-- renders a "Featured stores" row per department, ranked organically by
-- verified status / average rating / catalog size - entirely free, no
-- flag or table behind it. This phase makes that placement purchasable:
-- a seller pays out of their own wallet balance (seller_wallets - see
-- migration 017 and wallet.repository.js) to have their store ranked
-- first in one department's Featured Stores row for a fixed number of
-- days at the platform's current daily rate.
--
-- Unlike sponsorship_campaigns (migration 051), there is no boolean flag
-- to flip: a seller can have active products (and so a legitimate
-- Featured Stores appearance) in more than one department at once, so
-- "featured" has to be scoped per (seller, category) pair rather than a
-- single column on seller_profiles. featuredStore.service.js's ranking
-- query instead LEFT JOINs this table live and simply prioritizes any
-- row with a currently-active, unexpired campaign for that category -
-- so there's nothing to keep in sync on expiry/cancellation beyond this
-- row's own `status`.
--
-- `daily_rate` and `total_cost` are snapshotted at creation time (same
-- reasoning as sponsorship_campaigns.daily_rate / order_items.commission_rate
-- - a later admin rate change must never rewrite what a seller already
-- paid for a past campaign). `status` starts 'active' and is flipped to
-- 'expired' by the featuredStoreExpiry cron job once `ends_at` passes,
-- or to 'cancelled' if a seller cancels early (no refund - same policy
-- as sponsorship.service.js#cancelCampaign). `seller_id` references
-- `users(id)` directly, same convention `products.seller_id` and every
-- other seller-owned table in this schema already uses.
CREATE TABLE IF NOT EXISTS store_featured_campaigns (
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

    CONSTRAINT fk_store_featured_campaigns_seller
        FOREIGN KEY (seller_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_store_featured_campaigns_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE CASCADE,

    INDEX idx_store_featured_campaigns_seller (seller_id),
    INDEX idx_store_featured_campaigns_category_status_ends (category_id, status, ends_at),
    INDEX idx_store_featured_campaigns_status_ends (status, ends_at)
);

-- Flat daily cost (TZS) a seller pays to have their store featured in one
-- department, same key/value row shape every other platform_settings
-- entry uses (see migration 017). Read by
-- settingsService.getFeaturedStoreDailyRate(), edited by admins via the
-- existing PUT /admin/settings. Priced above sponsorship_daily_rate
-- (migration 051) by default since it promotes the whole store's
-- placement in a department, not a single product.
INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('featured_store_daily_rate', '8000')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
