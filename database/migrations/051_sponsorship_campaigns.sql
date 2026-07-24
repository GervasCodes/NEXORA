-- Migration 051: sponsorship_campaigns (Phase 8A - Sponsored Products)
-- Depends on: users (001), products (004), platform_settings (017)
-- Additive only.
--
-- Migration 041 added products.is_sponsored as just a display flag,
-- toggled for free by an admin (admin.service.js#setProductSponsored),
-- with a comment noting the real campaign/budget/payment system behind
-- it was Phase 8A's job. This is that system: a seller pays out of
-- their own wallet balance (seller_wallets - see migration 017 and
-- wallet.repository.js) to sponsor one of their own products for a
-- fixed number of days at the platform's current daily rate.
--
-- sponsorship_campaigns - one row per purchase. `daily_rate` and
-- `total_cost` are snapshotted at creation time (same reasoning as
-- order_items.commission_rate in migration 017 - a later admin rate
-- change must never rewrite what a seller already paid for a past
-- campaign). `status` starts 'active' and is flipped to 'expired' by
-- the sponsorshipExpiry cron job once `ends_at` passes, or to
-- 'cancelled' if a seller cancels early (no refund - see
-- sponsorship.service.js). `seller_id` references `users(id)` directly,
-- same convention `products.seller_id` and every other seller-owned
-- table in this schema already uses.
--
-- Deliberately does NOT touch or remove the admin's existing manual
-- sponsor/unsponsor toggle - that stays a separate, independent lever
-- for free admin curation. See README-phase-8A.md for how the two
-- interact if both are ever used on the same product at once.
CREATE TABLE IF NOT EXISTS sponsorship_campaigns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    product_id INT NOT NULL,

    daily_rate DECIMAL(12, 2) NOT NULL,
    days INT NOT NULL,
    total_cost DECIMAL(12, 2) NOT NULL,

    status ENUM('active', 'expired', 'cancelled') NOT NULL DEFAULT 'active',

    starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ends_at DATETIME NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sponsorship_campaigns_seller
        FOREIGN KEY (seller_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_sponsorship_campaigns_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE CASCADE,

    INDEX idx_sponsorship_campaigns_seller (seller_id),
    INDEX idx_sponsorship_campaigns_product (product_id),
    INDEX idx_sponsorship_campaigns_status_ends (status, ends_at)
);

-- Flat daily cost (TZS) a seller pays to sponsor one product, same
-- key/value row shape every other platform_settings entry uses (see
-- migration 017). Read by settingsService.getSponsorshipDailyRate(),
-- edited by admins via the existing PUT /admin/settings.
INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('sponsorship_daily_rate', '5000')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
