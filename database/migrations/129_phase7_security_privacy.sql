-- Migration 129: security and privacy hardening (master Phase 7).
--
-- 1. Private verification documents: the Cloudinary public_id and storage
--    type are stored next to (or instead of) the old public delivery URL.
--    Rows written before this migration keep file_storage = 'public' until
--    backend/scripts/migrateDocumentsToPrivate.js moves the asset.
-- 2. Retention bookkeeping for approved documents (file_purged_at).
-- 3. platform_setting_history: who changed which setting, from what to what.
-- 4. data_reset_approvals: two-person approval for a platform-wide reset.
-- 5. New platform settings.
--
-- Additive and safe to re-run: columns are added only when missing, tables
-- use IF NOT EXISTS, settings use ON DUPLICATE KEY.

-- ---- 1 + 2. account_verification_documents ------------------------------

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_verification_documents'
          AND COLUMN_NAME = 'file_public_id') = 0,
    'ALTER TABLE account_verification_documents ADD COLUMN file_public_id VARCHAR(255) NULL AFTER file_url',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_verification_documents'
          AND COLUMN_NAME = 'file_resource_type') = 0,
    'ALTER TABLE account_verification_documents ADD COLUMN file_resource_type VARCHAR(10) NULL AFTER file_public_id',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_verification_documents'
          AND COLUMN_NAME = 'file_format') = 0,
    'ALTER TABLE account_verification_documents ADD COLUMN file_format VARCHAR(10) NULL AFTER file_resource_type',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_verification_documents'
          AND COLUMN_NAME = 'file_storage') = 0,
    'ALTER TABLE account_verification_documents ADD COLUMN file_storage VARCHAR(20) NOT NULL DEFAULT ''public'' AFTER file_format',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_verification_documents'
          AND COLUMN_NAME = 'file_purged_at') = 0,
    'ALTER TABLE account_verification_documents ADD COLUMN file_purged_at TIMESTAMP NULL AFTER file_storage',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Private rows no longer carry a public URL.
ALTER TABLE account_verification_documents MODIFY COLUMN file_url VARCHAR(500) NULL;

-- ---- 1 + 2. kyc_upgrade_requests -----------------------------------------

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kyc_upgrade_requests'
          AND COLUMN_NAME = 'file_public_id') = 0,
    'ALTER TABLE kyc_upgrade_requests ADD COLUMN file_public_id VARCHAR(255) NULL AFTER file_url',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kyc_upgrade_requests'
          AND COLUMN_NAME = 'file_resource_type') = 0,
    'ALTER TABLE kyc_upgrade_requests ADD COLUMN file_resource_type VARCHAR(10) NULL AFTER file_public_id',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kyc_upgrade_requests'
          AND COLUMN_NAME = 'file_format') = 0,
    'ALTER TABLE kyc_upgrade_requests ADD COLUMN file_format VARCHAR(10) NULL AFTER file_resource_type',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kyc_upgrade_requests'
          AND COLUMN_NAME = 'file_storage') = 0,
    'ALTER TABLE kyc_upgrade_requests ADD COLUMN file_storage VARCHAR(20) NOT NULL DEFAULT ''public'' AFTER file_format',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kyc_upgrade_requests'
          AND COLUMN_NAME = 'file_purged_at') = 0,
    'ALTER TABLE kyc_upgrade_requests ADD COLUMN file_purged_at TIMESTAMP NULL AFTER file_storage',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE kyc_upgrade_requests MODIFY COLUMN file_url VARCHAR(500) NULL;

-- ---- 3. Setting change history -------------------------------------------

CREATE TABLE IF NOT EXISTS platform_setting_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL,
    old_value TEXT NULL,
    new_value TEXT NULL,
    changed_by INT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_platform_setting_history_key (setting_key, changed_at),
    CONSTRAINT fk_platform_setting_history_user
        FOREIGN KEY (changed_by) REFERENCES users(id)
        ON DELETE SET NULL
);

-- ---- 4. Platform reset approvals -----------------------------------------

CREATE TABLE IF NOT EXISTS data_reset_approvals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    requested_by INT NOT NULL,
    test_only BOOLEAN NOT NULL DEFAULT TRUE,
    approved_by INT NULL,
    approved_at TIMESTAMP NULL,
    executed_at TIMESTAMP NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_data_reset_approvals_requested_by (requested_by),
    CONSTRAINT fk_data_reset_approvals_requested_by
        FOREIGN KEY (requested_by) REFERENCES users(id),
    CONSTRAINT fk_data_reset_approvals_approved_by
        FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- ---- 5. Settings ---------------------------------------------------------
-- approved_document_retention_days = 0 keeps documents indefinitely (the
-- previous behaviour); set a number of days to purge approved documents.

INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('approved_document_retention_days', '0'),
    ('commission_rate_max', '30'),
    ('usd_exchange_rate_max_change_percent', '10')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
