-- Migration 026: centralized, role-agnostic account verification workflow.
-- Run after 025_conversation_delete_from_list.sql.
--
-- Context: sellers already had a verification system (seller_profiles.
-- verification_status + seller_verification_documents), but it only ever
-- ran AFTER a seller had registered, logged in, and set up a store - so a
-- seller (or a delivery agent, who had no verification system at all)
-- could use a freshly-registered account before any documents existed.
--
-- This migration adds a single, centralized verification gate that lives
-- on `users` directly (so it applies the same way to any role that needs
-- it - today that's seller and delivery_agent) and is populated as part
-- of registration itself, before the account is usable for anything
-- beyond browsing/login.
--
-- Existing seller_profiles.verification_status / documents / paid
-- "Verified Seller" badge system is untouched - it continues to control
-- the separate, optional paid badge. This migration only adds the base
-- "is this account allowed to use seller/delivery features at all" gate.

ALTER TABLE users
    ADD COLUMN account_verification_status
        ENUM('not_required', 'pending', 'approved', 'rejected')
        NOT NULL DEFAULT 'not_required' AFTER role,
    ADD COLUMN account_verification_rejection_reason VARCHAR(255) NULL
        AFTER account_verification_status,
    ADD COLUMN account_verification_submitted_at TIMESTAMP NULL
        AFTER account_verification_rejection_reason,
    ADD COLUMN account_verification_reviewed_at TIMESTAMP NULL
        AFTER account_verification_submitted_at,
    ADD COLUMN account_verification_reviewed_by INT NULL
        AFTER account_verification_reviewed_at;

ALTER TABLE users
    ADD CONSTRAINT fk_users_verification_reviewed_by
        FOREIGN KEY (account_verification_reviewed_by) REFERENCES users(id)
        ON DELETE SET NULL;

-- Grandfather in every account that already exists (registered under the
-- old flow, before documents were required at signup) so this migration
-- doesn't lock currently-active sellers/agents out of their own accounts.
-- Only NEW registrations going forward go through the pending gate.
UPDATE users
SET account_verification_status = 'approved'
WHERE role IN ('seller', 'delivery_agent');

CREATE TABLE IF NOT EXISTS account_verification_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,

    document_type ENUM('owner_photo', 'national_id', 'voter_id', 'drivers_license') NOT NULL,
    file_url VARCHAR(500) NOT NULL,

    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_account_verification_documents_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_account_verification_documents_user ON account_verification_documents (user_id);

-- Append-only audit trail ("Track verification history" requirement) -
-- one row per submit/approve/reject event, independent of the current
-- point-in-time status columns on `users`.
CREATE TABLE IF NOT EXISTS account_verification_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,

    action ENUM('submitted', 'resubmitted', 'approved', 'rejected') NOT NULL,
    reason VARCHAR(255) NULL,
    actor_admin_id INT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_account_verification_history_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_account_verification_history_actor
        FOREIGN KEY (actor_admin_id) REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_account_verification_history_user ON account_verification_history (user_id);
