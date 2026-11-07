-- Migration 142: Remove the active-listing cap (Phase 4 monetization
-- recalibration).
--
-- subscription.service.js#canCreateListing already treats a NULL
-- max_active_listings as "no cap" (used today only by the Pro plan), so
-- setting every plan's cap to NULL here is enough to make every tier
-- unlimited - no application code changes needed. The Free tier becomes
-- commission-only with no catalog-size restriction, matching the
-- intended model.
--
-- Also refreshes each plan's `features` bullet copy (same pattern as
-- migration 116) to drop the "Up to N active listings" / "Unlimited
-- active listings" line, since it's no longer a differentiator between
-- tiers.

UPDATE subscription_plans SET max_active_listings = NULL;

UPDATE subscription_plans
SET features = JSON_ARRAY('Standard platform commission')
WHERE code = 'free';

UPDATE subscription_plans
SET features = JSON_ARRAY('Reduced 8% commission', 'Analytics & AI insights', '3 sponsored campaign days/month included', 'Email support')
WHERE code = 'starter';

UPDATE subscription_plans
SET features = JSON_ARRAY('Reduced 6% commission', 'Analytics & AI insights', '10 sponsored campaign days/month included', 'Priority support')
WHERE code = 'growth';

UPDATE subscription_plans
SET features = JSON_ARRAY('Reduced 4% commission', 'Analytics & AI insights', '30 sponsored campaign days/month included', 'Priority support', 'Early access to new features')
WHERE code = 'pro';
