-- Migration 154: Round 6 Phase 5 - configurable cart caps + structured payouts.
-- Run after 153_email_delivery_events_broadcast_id.sql.
--
--  A. platform_settings: max_quantity_per_cart_line / max_cart_line_items
--     (were constants in cart.service.js). Admin-editable.
--  B. withdrawal_requests: structured payout columns. payout_method and the
--     composed payout_details text stay (first-payout hold matching, masking
--     and admin lists keep working); new requests also fill:
--       mobile_money  -> payout_network + payout_phone
--       bank_transfer -> payout_bank_name + payout_account_number + payout_account_name
--     Existing free-text rows are backfilled best-effort below; anything that
--     can't be read confidently is left NULL and keeps its original text.

INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('max_quantity_per_cart_line', '500'),
    ('max_cart_line_items', '100')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'withdrawal_requests' AND COLUMN_NAME = 'payout_network') = 0,
    'ALTER TABLE withdrawal_requests ADD COLUMN payout_network VARCHAR(30) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'withdrawal_requests' AND COLUMN_NAME = 'payout_phone') = 0,
    'ALTER TABLE withdrawal_requests ADD COLUMN payout_phone VARCHAR(20) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'withdrawal_requests' AND COLUMN_NAME = 'payout_bank_name') = 0,
    'ALTER TABLE withdrawal_requests ADD COLUMN payout_bank_name VARCHAR(80) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'withdrawal_requests' AND COLUMN_NAME = 'payout_account_number') = 0,
    'ALTER TABLE withdrawal_requests ADD COLUMN payout_account_number VARCHAR(30) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'withdrawal_requests' AND COLUMN_NAME = 'payout_account_name') = 0,
    'ALTER TABLE withdrawal_requests ADD COLUMN payout_account_name VARCHAR(120) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Best-effort backfill (only rows not yet structured, so re-running is safe).
-- Mobile money: keep the digits as a Tanzanian number when exactly 9 national
-- digits remain, and map the network from keywords in the old text.
UPDATE withdrawal_requests
SET payout_phone = CONCAT('+255', RIGHT(REGEXP_REPLACE(payout_details, '[^0-9]', ''), 9)),
    payout_network = CASE
        WHEN LOWER(payout_details) REGEXP 'mpesa|m-pesa|vodacom' THEN 'vodacom_mpesa'
        WHEN LOWER(payout_details) REGEXP 'tigo|mixx|yas'        THEN 'tigo_pesa'
        WHEN LOWER(payout_details) REGEXP 'airtel'               THEN 'airtel_money'
        WHEN LOWER(payout_details) REGEXP 'halo'                 THEN 'halopesa'
        ELSE NULL
    END
WHERE payout_method = 'mobile_money'
  AND payout_phone IS NULL
  AND CHAR_LENGTH(REGEXP_REPLACE(payout_details, '[^0-9]', '')) IN (9, 10, 12);

-- Bank: only the account number (first run of 6+ digits) is read confidently;
-- bank and holder names stay in the original text.
UPDATE withdrawal_requests
SET payout_account_number = REGEXP_SUBSTR(payout_details, '[0-9]{6,}')
WHERE payout_method = 'bank_transfer'
  AND payout_account_number IS NULL
  AND REGEXP_SUBSTR(payout_details, '[0-9]{6,}') <> '';
