-- Migration 119: Payment integrity (master prompt Phase 1).
-- Run after 118_broadcast_in_app_channel.sql. Safe to re-run: every column,
-- index and table below is guarded so a second run changes nothing.
--
--   payments.payment_reference   Unique opaque reference sent to the provider
--                                for ONE payment attempt (ORDER-<id>-<random>),
--                                so a late callback from attempt 1 can never
--                                be applied to attempt 2. NULL for rows created
--                                before this migration (legacy ORDER-<id>).
--   payments.expected_usd_amount / usd_exchange_rate
--                                PayPal only: what we asked PayPal to charge,
--                                fixed at creation, compared with what PayPal
--                                says it captured.
--   payments.status 'chargeback' A completed card payment the buyer's bank
--                                reversed / disputed.
--   payment_review_queue         Admin-visible list of payments that need a
--                                human decision (paid after cancel, amount
--                                mismatch, duplicate payment, chargeback,
--                                "completed at provider, not here", ...).
--   order_items.chargeback_reversed_at
--                                Set once a chargeback reversed that item's
--                                seller earnings, so it is never reversed twice.

-- payments.payment_reference
SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'payment_reference') = 0,
    'ALTER TABLE payments ADD COLUMN payment_reference VARCHAR(64) NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND INDEX_NAME = 'uniq_payments_reference') = 0,
    'ALTER TABLE payments ADD UNIQUE KEY uniq_payments_reference (payment_reference)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- payments.expected_usd_amount / usd_exchange_rate
SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'expected_usd_amount') = 0,
    'ALTER TABLE payments ADD COLUMN expected_usd_amount DECIMAL(12, 2) NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'usd_exchange_rate') = 0,
    'ALTER TABLE payments ADD COLUMN usd_exchange_rate DECIMAL(14, 4) NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- payments.chargeback_at / chargeback_reason
SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'chargeback_at') = 0,
    'ALTER TABLE payments ADD COLUMN chargeback_at TIMESTAMP NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'chargeback_reason') = 0,
    'ALTER TABLE payments ADD COLUMN chargeback_reason VARCHAR(255) NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- MODIFY to a superset of the old ENUM is naturally re-runnable.
ALTER TABLE payments
    MODIFY status ENUM('pending', 'completed', 'failed', 'chargeback') NOT NULL DEFAULT 'pending';

-- The stale sweep and the daily reconciliation both scan by status + age.
SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND INDEX_NAME = 'idx_payments_status_created') = 0,
    'ALTER TABLE payments ADD INDEX idx_payments_status_created (status, created_at)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- order_items.chargeback_reversed_at
SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'chargeback_reversed_at') = 0,
    'ALTER TABLE order_items ADD COLUMN chargeback_reversed_at TIMESTAMP NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Admin review queue. One row per (payment, reason): raising the same flag
-- twice (a replayed webhook, the next reconciliation run) updates the
-- existing row instead of alerting admins again.
CREATE TABLE IF NOT EXISTS payment_review_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL,
    reason VARCHAR(48) NOT NULL,
    details TEXT NULL,
    status ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
    resolution_note VARCHAR(500) NULL,
    resolved_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,

    UNIQUE KEY uniq_payment_review (payment_id, reason),
    KEY idx_payment_review_status (status, created_at),

    CONSTRAINT fk_payment_review_payment
        FOREIGN KEY (payment_id) REFERENCES payments(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
