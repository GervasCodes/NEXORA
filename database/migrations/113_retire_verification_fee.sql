-- Migration 113: retire the one-time seller verification fee.
-- Run after 112_data_reset_bookings.sql.
--
-- Context: the Verified Seller badge used to require BOTH
-- users.account_verification_status = 'approved' AND
-- seller_profiles.verification_fee_paid = TRUE (see the old
-- seller.service.js#syncBadge). The fee is retired - the badge is now
-- free and follows account approval alone (see the updated syncBadge).
--
-- This is an upgrade, not a downgrade: every seller who was already
-- account-verification-approved but had NOT paid the fee now gets the
-- free badge, same as every seller going forward will. Sellers who
-- HAD paid the fee simply keep the badge they already had - nothing
-- changes for them.
--
-- Per the verification/monetization roadmap's confirmed decision #2:
-- this does NOT grant anyone the new, separate "Verified Business"
-- (BRELA/TIN/business-license-backed) tier - that tier doesn't exist
-- yet (see the KYC phase of this roadmap) and nothing here enrolls
-- anyone into it automatically.
--
-- verification_fee_amount/paid/reference/paid_at columns on
-- seller_profiles are left in place (unused going forward, not
-- dropped) - they're historical record of what was actually paid
-- under the old system, not something this migration should erase.

UPDATE seller_profiles sp
JOIN users u ON u.id = sp.user_id
SET sp.is_verified = TRUE
WHERE u.account_verification_status = 'approved'
  AND sp.is_verified = FALSE;

-- The Monetization Master Switch flag for this fee no longer has any
-- code path that reads it (see settings.service.js) - remove the row
-- so it doesn't linger in the admin settings table or the audit log's
-- "last changed" lookups as a dead, unrecognized key.
DELETE FROM platform_settings WHERE setting_key = 'monetization_verification_fee_enabled';

-- The fee-amount setting (seller_verification_fee) is likewise no
-- longer read anywhere - remove it the same way.
DELETE FROM platform_settings WHERE setting_key = 'seller_verification_fee';
