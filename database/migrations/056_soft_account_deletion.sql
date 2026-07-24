-- Migration 056: soft account deletion (Phase 3 of the
-- Services/Dark-Mode/Deletion implementation plan).
--
-- Until now, "delete my account" (account.service.js#deleteAccount)
-- immediately anonymized the user row in one step - scrubbing the name,
-- email, and phone right away. That collapses the two things the plan
-- asks for into one irreversible action and gives admins nothing to
-- review before the data is gone.
--
-- This migration only adds the bookkeeping the soft-delete step needs:
-- a `deleted_at` timestamp, set the moment a user deletes their own
-- account. The existing `is_active` flag continues to be the single
-- switch that blocks login (auth/login.service.js) and live API access
-- (auth.middleware.js) - it's reused as-is for a deleted account rather
-- than adding a second, parallel "can this account authenticate" flag.
-- `deleted_at` exists purely to distinguish *why* is_active is false:
--   - is_active = FALSE, deleted_at = NULL      -> admin-deactivated
--     (reversible - admin.service.js#setUserActive still allows this)
--   - is_active = FALSE, deleted_at = NOT NULL  -> self-deleted
--     (not reversible - setUserActive now refuses to reactivate these;
--     see admin/AdminDeletedAccounts.jsx for the read-only review list)
--
-- Deliberately not touching first_name/last_name/email/phone here -
-- scrubbing/erasing that data, plus removing related records, documents,
-- and Cloudinary assets, is Phase 4 (Permanent Account Removal)'s job.
-- Keeping it intact for now is what lets the Phase 3 "Deleted Accounts"
-- admin section actually show who the account belonged to.

ALTER TABLE users
    ADD COLUMN deleted_at TIMESTAMP NULL AFTER is_active;

CREATE INDEX idx_users_deleted_at ON users (deleted_at);
