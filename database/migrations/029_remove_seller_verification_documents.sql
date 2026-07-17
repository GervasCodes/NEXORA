-- Migration 029: remove the old, now-redundant seller document-review
-- system. Run after 028_payment_charged_currency.sql.
--
-- Context: migration 026 introduced a centralized, role-agnostic
-- `users.account_verification_status` gate, populated at registration
-- itself (owner photo + National/Voter ID, or driver's license for
-- delivery agents), reviewed via /admin/account-verifications. That
-- fully supersedes the older `seller_profiles.verification_status` +
-- `seller_verification_documents` flow (documents submitted AFTER
-- registration, from the seller's own "Seller Verification" page,
-- reviewed via the old /admin/verifications screen) - sellers were
-- previously asked for two overlapping sets of ID documents at two
-- different points in their lifecycle. This migration removes the old
-- one now that the new one is confirmed live and already used in
-- production review (see Phase 1/3 changelogs).
--
-- What is NOT touched: the paid "Verified Seller" badge fee columns
-- (verification_fee_amount/paid/reference/paid_at) and the `is_verified`
-- badge flag itself - the fee is a separate, still-needed concept. Only
-- the badge's *approval source* changes: it used to require
-- seller_profiles.verification_status = 'approved' (set by the old admin
-- screen), and now requires users.account_verification_status =
-- 'approved' (set by the new one) - see seller.service.js's syncBadge.
--
-- Backfill below recomputes is_verified under the new rule so no
-- seller's badge state silently drifts the moment the old column
-- disappears: a seller who had paid the fee and been approved under the
-- old system keeps the badge (their account was also grandfathered to
-- account_verification_status = 'approved' by migration 026); a seller
-- who paid the fee but was never approved under either system loses a
-- badge they were never actually entitled to.

UPDATE seller_profiles sp
JOIN users u ON u.id = sp.user_id
SET sp.is_verified = (u.account_verification_status = 'approved' AND sp.verification_fee_paid = TRUE);

DROP TABLE IF EXISTS seller_verification_documents;

ALTER TABLE seller_profiles
    DROP COLUMN verification_status,
    DROP COLUMN verification_rejection_reason,
    DROP COLUMN verification_submitted_at,
    DROP COLUMN verification_reviewed_at;
