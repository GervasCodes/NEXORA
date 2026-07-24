-- Migration 057: permanent account deletion (Phase 4 of the
-- Services/Dark-Mode/Deletion implementation plan).
--
-- Phase 3 (migration 056) added `deleted_at`, set the moment a user
-- soft-deletes their own account, and left name/email/phone/seller
-- profile intact so an admin could review who the account belonged to
-- before anything is actually erased.
--
-- This migration adds the one column Phase 4 needs to track *that* an
-- admin has since carried out the erasure step:
--   - deleted_at = NOT NULL, permanently_deleted_at = NULL
--       -> self-deleted, awaiting admin review (Phase 3 end state)
--   - deleted_at = NOT NULL, permanently_deleted_at = NOT NULL
--       -> admin has permanently erased this account's PII and deleted
--          its removable data/documents/Cloudinary assets
--          (admin.service.js#permanentlyDeleteUser)
--
-- Deliberately not a second `is_active`-style gate and not a row
-- deletion: `orders.buyer_id`, `order_items.seller_id`, `reviews.buyer_id`,
-- `disputes.buyer_id`/`seller_id`, `delivery_ratings.agent_id`/`buyer_id`,
-- `conversations`/`messages` and others all reference `users(id)` without
-- ON DELETE CASCADE (see database/migrations/00[4,6,9] etc.) specifically
-- so financial and legal records outlive the account that created them -
-- an actual `DELETE FROM users` would fail with a foreign key error for
-- any account that ever placed an order, sold a product, left a review,
-- filed a dispute, or delivered a package. Permanent removal therefore
-- means "erase every identifying field on the row, delete what's safe to
-- delete outright, and keep the row itself as an anonymized tombstone" -
-- not "delete the row" - see admin.service.js#permanentlyDeleteUser for
-- the full breakdown of what's erased vs. what's deliberately retained.

ALTER TABLE users
    ADD COLUMN permanently_deleted_at TIMESTAMP NULL AFTER deleted_at;

CREATE INDEX idx_users_permanently_deleted_at ON users (permanently_deleted_at);
