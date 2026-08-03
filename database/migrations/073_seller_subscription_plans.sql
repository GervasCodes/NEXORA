-- Migration 073: Seller subscription / tiered pricing plans (Revenue &
-- Product Enhancements roadmap).
--
-- Design notes:
--  - subscription_plans is a small, admin-managed catalog (mirrors how
--    platform_settings/sponsorship rates are admin-tunable - see 017,
--    051-053) rather than hardcoded tiers, so pricing can change without
--    a deploy. `commission_rate_override` is nullable: NULL means "use
--    the platform's default commission_rate setting" (017), a non-null
--    value means this plan's subscribers get that rate instead. This is
--    the same "snapshot vs fallback" shape settingsService already uses
--    everywhere else.
--  - seller_subscriptions is one row per subscription period, not a
--    single mutable row per seller - renewals/plan-changes insert a new
--    row rather than overwrite the old one, so a seller's subscription
--    history is preserved (same append-only reasoning as
--    wallet_transactions in 017). "current plan" is just "most recent
--    row with status='active' and current_period_end in the future",
--    resolved in subscription.repository.js, not enforced by a
--    uniqueness constraint here - a lapsed/cancelled row and a fresh one
--    coexisting is normal, not an error state.
--  - Every seller has an implicit Free plan even with zero rows in this
--    table (subscription.service.js treats "no active row" as Free) -
--    the Free plan is seeded below mainly so the plan-list/admin UI has
--    a real row to show and edit, and so an explicit downgrade-to-Free
--    action has a plan_id to point at.
--  - Payments follow the exact same shape 019/064 already established
--    for verification fees and booking payments: purpose gains a fourth
--    value, a nullable subscription_id column identifies which
--    seller_subscriptions row this payment is for, and
--    payment.service.js gets a sibling set of
--    initiate*SubscriptionPayment functions mirroring
--    initiate*VerificationFeePayment one-for-one (no predetermined
--    payment_method column to validate against, same as verification
--    fees/bookings).

CREATE TABLE IF NOT EXISTS subscription_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,

    price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    billing_cycle ENUM('monthly', 'annual') NOT NULL DEFAULT 'monthly',

    -- NULL = use the platform default commission_rate setting.
    commission_rate_override DECIMAL(5, 2) NULL,
    -- NULL = unlimited active listings (products + services combined).
    max_active_listings INT NULL,

    -- Free-form list of feature bullet strings shown on the pricing
    -- page, e.g. ["Priority support", "Sponsored listing discount"].
    -- Not read anywhere else in the backend - display only.
    features JSON NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS seller_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    plan_id INT NOT NULL,

    status ENUM('pending', 'active', 'past_due', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',

    current_period_start TIMESTAMP NULL,
    current_period_end TIMESTAMP NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    cancelled_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_seller_subscriptions_seller
        FOREIGN KEY (seller_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_seller_subscriptions_plan
        FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
        ON DELETE RESTRICT
);

CREATE INDEX idx_seller_subscriptions_seller_status ON seller_subscriptions (seller_id, status);

ALTER TABLE payments
    ADD COLUMN subscription_id INT NULL AFTER booking_id,
    MODIFY purpose ENUM('order_payment', 'seller_verification_fee', 'booking_payment', 'subscription_payment')
        NOT NULL DEFAULT 'order_payment';

ALTER TABLE payments
    ADD CONSTRAINT fk_payments_subscription
        FOREIGN KEY (subscription_id) REFERENCES seller_subscriptions(id)
        ON DELETE CASCADE;

CREATE INDEX idx_payments_subscription ON payments (subscription_id);

-- Seed the standard tiers. Prices are flat TZS/month, deliberately
-- conservative placeholders - an admin can edit them from
-- AdminSubscriptionPlans without a deploy. The Free plan has NULL
-- overrides (platform default commission, unlimited listings) so it's
-- a true no-op tier.
INSERT INTO subscription_plans (code, name, description, price, billing_cycle, commission_rate_override, max_active_listings, features, sort_order) VALUES
    ('free', 'Free', 'Get started selling on NEXORA at no cost.', 0, 'monthly', NULL, 20, JSON_ARRAY('Up to 20 active listings', 'Standard platform commission'), 0),
    ('starter', 'Starter', 'For sellers ready to grow their catalog.', 15000, 'monthly', 8.00, 100, JSON_ARRAY('Up to 100 active listings', 'Reduced 8% commission', 'Email support'), 1),
    ('growth', 'Growth', 'Lower commission and room for a full catalog.', 35000, 'monthly', 6.00, 500, JSON_ARRAY('Up to 500 active listings', 'Reduced 6% commission', 'Priority support'), 2),
    ('pro', 'Pro', 'Our best rate for high-volume sellers.', 75000, 'monthly', 4.00, NULL, JSON_ARRAY('Unlimited active listings', 'Reduced 4% commission', 'Priority support', 'Early access to new features'), 3)
ON DUPLICATE KEY UPDATE code = code;
