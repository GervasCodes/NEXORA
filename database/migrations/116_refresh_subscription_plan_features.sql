-- Migration 116: Refresh subscription_plans.features bullet copy.
--
-- The `features` column (073) was only ever seeded once, at initial
-- rollout. Two real entitlements were added to paid tiers afterwards
-- and never made it into this marketing copy: the Analytics/AI access
-- gate (113_retire_verification_fee.sql - any active non-free plan
-- unlocks Analytics + AI seller-analytics/demand-forecast, Free does
-- not) and the sponsorship-credit allotment (115_sponsorship_credits.sql
-- - sponsorship_credits_per_month). Sellers comparing plans on
-- SellerSubscription.jsx had no way to know either existed. This is a
-- one-time copy fix, matching each plan's actual current columns;
-- admin can edit further from AdminSubscriptions once round-3 phase 4
-- adds a features field there.

UPDATE subscription_plans
SET features = JSON_ARRAY('Up to 20 active listings', 'Standard platform commission')
WHERE code = 'free';

UPDATE subscription_plans
SET features = JSON_ARRAY('Up to 100 active listings', 'Reduced 8% commission', 'Analytics & AI insights', '3 sponsored campaign days/month included', 'Email support')
WHERE code = 'starter';

UPDATE subscription_plans
SET features = JSON_ARRAY('Up to 500 active listings', 'Reduced 6% commission', 'Analytics & AI insights', '10 sponsored campaign days/month included', 'Priority support')
WHERE code = 'growth';

UPDATE subscription_plans
SET features = JSON_ARRAY('Unlimited active listings', 'Reduced 4% commission', 'Analytics & AI insights', '30 sponsored campaign days/month included', 'Priority support', 'Early access to new features')
WHERE code = 'pro';
