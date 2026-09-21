-- Migration 114: Verified Business tier (BRELA / TIN / business license KYC).
-- Run after 113_retire_verification_fee.sql.
--
-- Adds a second, higher verification tier above the free ID-based
-- "Verified Seller" badge:
--
--   none               -> account not (yet) approved
--   id_verified        -> NIDA / Voter's ID approved (the "Verified Seller" badge)
--   business_verified  -> BRELA + TIN + business license approved
--                         (the "Verified Business" badge)
--
-- users.verification_tier is the review outcome; seller_profiles.
-- is_business_verified is its denormalized public-facing twin, the same
-- pattern as users.account_verification_status / seller_profiles.
-- is_verified, so the many public listing queries that already select
-- sp.is_verified only need one more plain column - no extra join to
-- users.
--
-- Backfill: every seller whose account is already approved is
-- 'id_verified' - exactly the set migration 113 left holding the
-- Verified Seller badge. Nobody is enrolled in business_verified here;
-- that only ever happens through an admin approving a real document
-- submission.

ALTER TABLE users
    ADD COLUMN verification_tier
        ENUM('none', 'id_verified', 'business_verified')
        NOT NULL DEFAULT 'none' AFTER account_verification_reviewed_by;

UPDATE users
SET verification_tier = 'id_verified'
WHERE role = 'seller' AND account_verification_status = 'approved';

ALTER TABLE seller_profiles
    ADD COLUMN is_business_verified BOOLEAN NOT NULL DEFAULT FALSE AFTER is_verified;

-- One row per tier-upgrade submission. At most one 'pending' row per
-- user is enforced in accountVerification.service.js (row lock on the
-- user, then check-and-insert) rather than with a unique index over a
-- generated column - MySQL rejects ON DELETE CASCADE foreign keys on the
-- base column of a stored generated column.
CREATE TABLE IF NOT EXISTS business_verification_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,

    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    rejection_reason VARCHAR(255) NULL,

    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    reviewed_by INT NULL,

    CONSTRAINT fk_business_verification_requests_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_business_verification_requests_reviewer
        FOREIGN KEY (reviewed_by) REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_business_verification_requests_user_status
    ON business_verification_requests (user_id, status);
CREATE INDEX idx_business_verification_requests_status
    ON business_verification_requests (status, submitted_at);

-- Reuse the existing document + audit-trail tables (same admin review
-- surface) instead of forking new ones.
ALTER TABLE account_verification_documents
    MODIFY COLUMN document_type ENUM(
        'owner_photo', 'national_id', 'voter_id', 'drivers_license',
        'brela_certificate', 'tin_certificate', 'business_license'
    ) NOT NULL,
    ADD COLUMN business_request_id INT NULL AFTER user_id,
    ADD CONSTRAINT fk_account_verification_documents_business_request
        FOREIGN KEY (business_request_id) REFERENCES business_verification_requests(id)
        ON DELETE CASCADE;

CREATE INDEX idx_account_verification_documents_business_request
    ON account_verification_documents (business_request_id);

ALTER TABLE account_verification_history
    MODIFY COLUMN action ENUM(
        'submitted', 'resubmitted', 'approved', 'rejected',
        'business_submitted', 'business_approved', 'business_rejected'
    ) NOT NULL;
