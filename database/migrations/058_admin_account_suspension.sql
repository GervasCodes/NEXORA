-- Migration 058: admin account suspension (Phase 1 of the Admin Account
-- Control plan).
--
-- Replaces the old admin "Deactivate Account" lever (a bare is_active
-- toggle with no record of who flipped it or why) with a proper
-- Suspend/Unsuspend action. `is_active` continues to be the single
-- switch that blocks login (auth/login.service.js) and live API access
-- (auth.middleware.js) - reused as-is, same pattern migration 056 used
-- for self-deletion. These three new columns exist purely to record
-- *why* is_active is false when the cause is an admin suspension, and
-- who did it:
--
--   - is_active = FALSE, suspended_at = NOT NULL  -> admin-suspended
--     (reversible - admin.service.js#unsuspendUser clears all three
--     columns and flips is_active back to TRUE)
--   - is_active = FALSE, deleted_at = NOT NULL     -> self-deleted
--     (unaffected by this migration - still not reversible)
--
-- A suspended account is never also self-deleted and vice versa
-- (account.service.js#deleteAccount is user-initiated on their own
-- still-active account; admin.service.js#suspendUser/permanentlyDeleteUser
-- both refuse to act on an account that already has deleted_at set), so
-- the two causes never need to be disambiguated for the same row.
--
-- suspended_by is nullable + ON DELETE SET NULL (same pattern as
-- fraud_flags.resolved_by / disputes.resolved_by) rather than blocking
-- an admin's own account from ever being permanently removed later.

ALTER TABLE users
    ADD COLUMN suspended_at TIMESTAMP NULL AFTER deleted_at,
    ADD COLUMN suspension_reason VARCHAR(500) NULL AFTER suspended_at,
    ADD COLUMN suspended_by INT NULL AFTER suspension_reason;

ALTER TABLE users
    ADD CONSTRAINT fk_users_suspended_by
        FOREIGN KEY (suspended_by) REFERENCES users(id)
        ON DELETE SET NULL;

CREATE INDEX idx_users_suspended_at ON users (suspended_at);
