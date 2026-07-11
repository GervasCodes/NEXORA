-- Migration 018: seller verification workflow, verified-seller fee/badge,
-- user settings (language/theme/currency), and super admin / admin roles.
-- Run after 017_wallet_commission_earnings.sql.
--
-- Design notes:
--  - seller_profiles.verification_status is the gate that decides whether a
--    seller can add/sell products ('approved' only). is_verified (added in
--    admin_columns.sql) is kept as-is and now means "has the paid Verified
--    Seller badge" - a seller can be 'approved' (allowed to sell) without
--    yet being is_verified=1 (hasn't paid the badge fee).
--  - seller_verification_documents is append-only: a seller can resubmit
--    after a rejection, which just adds new rows rather than overwriting,
--    so admins can see the resubmission history.
--  - users.admin_level only means something when role = 'admin'. Existing
--    admin accounts are backfilled as 'super_admin' so nobody locks
--    themselves out of admin management after this migration runs.

ALTER TABLE seller_profiles
    ADD COLUMN verification_status ENUM('unverified', 'pending', 'approved', 'rejected')
        NOT NULL DEFAULT 'unverified' AFTER is_verified,
    ADD COLUMN verification_rejection_reason VARCHAR(255) NULL AFTER verification_status,
    ADD COLUMN verification_submitted_at TIMESTAMP NULL AFTER verification_rejection_reason,
    ADD COLUMN verification_reviewed_at TIMESTAMP NULL AFTER verification_submitted_at,
    ADD COLUMN verification_fee_amount DECIMAL(12, 2) NULL AFTER verification_reviewed_at,
    ADD COLUMN verification_fee_paid BOOLEAN NOT NULL DEFAULT FALSE AFTER verification_fee_amount,
    ADD COLUMN verification_fee_reference VARCHAR(150) NULL AFTER verification_fee_paid,
    ADD COLUMN verification_fee_paid_at TIMESTAMP NULL AFTER verification_fee_reference;

-- Existing verified sellers (is_verified = 1 from the old simple toggle)
-- are treated as already-approved so they don't lose selling access.
UPDATE seller_profiles SET verification_status = 'approved' WHERE is_verified = TRUE;

INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('seller_verification_fee', '20000')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

CREATE TABLE IF NOT EXISTS seller_verification_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,

    document_type ENUM('national_id', 'voter_id', 'business_registration') NOT NULL,
    file_url VARCHAR(500) NOT NULL,

    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_seller_verification_documents_seller
        FOREIGN KEY (seller_id) REFERENCES users(id)
        ON DELETE CASCADE
);

-- --- Admin roles ---

ALTER TABLE users
    ADD COLUMN admin_level ENUM('admin', 'super_admin') NULL AFTER role,
    ADD COLUMN language VARCHAR(10) NOT NULL DEFAULT 'en' AFTER admin_level,
    ADD COLUMN theme ENUM('light', 'dark', 'system') NOT NULL DEFAULT 'system' AFTER language,
    ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'TZS' AFTER theme;

-- Backfill: any existing admin accounts become super_admin so the platform
-- always has at least one super admin able to manage other admins.
UPDATE users SET admin_level = 'super_admin' WHERE role = 'admin';
