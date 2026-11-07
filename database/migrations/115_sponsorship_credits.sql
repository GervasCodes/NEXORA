-- Migration 115: Subscription-bundled sponsorship credits.
-- Run after 114_verified_business_tier.sql.
--
-- Each subscription plan now carries a monthly allotment of included
-- sponsorship credits. One credit = one campaign-day, usable on any of
-- the three campaign types (product sponsorship, featured store,
-- department sponsorship). When a seller starts a campaign, included
-- credits are consumed first; whatever days they don't cover fall back
-- to the existing paid a la carte flow (wallet debit at the campaign
-- type's daily rate).
--
--   subscription_plans.sponsorship_credits_per_month
--       Admin-editable allotment per plan. For an 'annual' billing
--       cycle the period grant is this value x 12 (see
--       sponsorshipCredit.service.js#computeGrantForPlan).
--
--   seller_sponsorship_credit_periods
--       One row per seller_subscriptions row (i.e. per billing period -
--       a renewal or plan change is a new subscription row, see 073),
--       so "reset on renewal" is simply "a new row with a fresh grant".
--       UNIQUE(subscription_id) makes the grant idempotent: a replayed
--       payment webhook re-running activation can never grant twice.
--       Unused credits do not roll over - the old row just stops being
--       the seller's current period.
--
--   <campaign tables>.credits_used
--       How many of a campaign's days were paid for with included
--       credits. total_cost keeps meaning "what was charged to the
--       wallet", so a fully credit-funded campaign has total_cost = 0
--       and credits_used = days.

ALTER TABLE subscription_plans
    ADD COLUMN sponsorship_credits_per_month INT NOT NULL DEFAULT 0 AFTER max_active_listings;

-- Default allotments for the seeded tiers (073). Placeholders in the same
-- spirit as the seeded prices - an admin can edit them from
-- AdminSubscriptions without a deploy.
UPDATE subscription_plans
SET sponsorship_credits_per_month = CASE code
    WHEN 'free' THEN 0
    WHEN 'starter' THEN 3
    WHEN 'growth' THEN 10
    WHEN 'pro' THEN 30
    ELSE sponsorship_credits_per_month
END
WHERE code IN ('free', 'starter', 'growth', 'pro');

CREATE TABLE IF NOT EXISTS seller_sponsorship_credit_periods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    subscription_id INT NOT NULL,

    credits_granted INT NOT NULL DEFAULT 0,
    credits_used INT NOT NULL DEFAULT 0,

    period_start DATETIME NOT NULL,
    period_end DATETIME NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_credit_periods_seller
        FOREIGN KEY (seller_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_credit_periods_subscription
        FOREIGN KEY (subscription_id) REFERENCES seller_subscriptions(id)
        ON DELETE CASCADE,

    UNIQUE KEY uq_credit_periods_subscription (subscription_id),
    INDEX idx_credit_periods_seller_period (seller_id, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sellers who are already on an active, in-period paid subscription when
-- this migration runs would otherwise get nothing until their next
-- activation - grant them the current period's allotment now.
INSERT INTO seller_sponsorship_credit_periods
    (seller_id, subscription_id, credits_granted, credits_used, period_start, period_end)
SELECT ss.seller_id, ss.id,
       sp.sponsorship_credits_per_month * IF(sp.billing_cycle = 'annual', 12, 1),
       0, ss.current_period_start, ss.current_period_end
FROM seller_subscriptions ss
JOIN subscription_plans sp ON sp.id = ss.plan_id
WHERE ss.status = 'active'
    AND ss.current_period_start IS NOT NULL
    AND ss.current_period_end IS NOT NULL
    AND ss.current_period_end >= NOW()
ON DUPLICATE KEY UPDATE subscription_id = subscription_id;

ALTER TABLE sponsorship_campaigns
    ADD COLUMN credits_used INT NOT NULL DEFAULT 0 AFTER total_cost;

ALTER TABLE store_featured_campaigns
    ADD COLUMN credits_used INT NOT NULL DEFAULT 0 AFTER total_cost;

ALTER TABLE department_sponsorship_campaigns
    ADD COLUMN credits_used INT NOT NULL DEFAULT 0 AFTER total_cost;
