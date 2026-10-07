-- Phase 5: refund cap tracking, dispute SLA fields, return-window and
-- dispute-response-window settings, delivery handover codes, booking
-- refund/payer-phone fields, EFD retry bookkeeping.
--
-- Safe to re-run: every ADD COLUMN/ADD INDEX below is guarded, and new
-- columns default to a value that correctly describes existing rows
-- (0 refunded so far, no SLA timestamps yet, etc) - no backfill UPDATE
-- is needed beyond those defaults.

-- ---- Refund cap (P0) --------------------------------------------------
-- total_refunded lets dispute/return/cancellation refunds all check
-- "would this exceed what was actually paid" against one running total
-- per order and, where relevant, per item - instead of each refund path
-- only knowing about itself and none of the others.

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'total_refunded'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE orders ADD COLUMN total_refunded DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER total_amount',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'total_refunded'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE order_items ADD COLUMN total_refunded DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER subtotal',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---- Dispute SLA (P1) ---------------------------------------------------

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'disputes' AND COLUMN_NAME = 'first_response_at'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE disputes ADD COLUMN first_response_at TIMESTAMP NULL AFTER created_at',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'disputes' AND COLUMN_NAME = 'sla_12h_notified_at'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE disputes ADD COLUMN sla_12h_notified_at TIMESTAMP NULL AFTER first_response_at',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'disputes' AND COLUMN_NAME = 'sla_20h_notified_at'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE disputes ADD COLUMN sla_20h_notified_at TIMESTAMP NULL AFTER sla_12h_notified_at',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'disputes' AND COLUMN_NAME = 'seller_response_overdue'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE disputes ADD COLUMN seller_response_overdue TINYINT(1) NOT NULL DEFAULT 0 AFTER sla_20h_notified_at',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'disputes' AND INDEX_NAME = 'idx_disputes_status_created'
);
SET @sql = IF(@idx_exists = 0,
    'ALTER TABLE disputes ADD INDEX idx_disputes_status_created (status, created_at)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---- Delivery proof: handover code (P0) --------------------------------

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'delivery_handover_code'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE orders ADD COLUMN delivery_handover_code VARCHAR(6) NULL AFTER total_refunded',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deliveries' AND COLUMN_NAME = 'handover_verified'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE deliveries ADD COLUMN handover_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER delivered_at',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deliveries' AND COLUMN_NAME = 'handover_method'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE deliveries ADD COLUMN handover_method ENUM(''code'', ''photo_gps'') NULL AFTER handover_verified',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deliveries' AND COLUMN_NAME = 'dropoff_photo_url'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE deliveries ADD COLUMN dropoff_photo_url VARCHAR(500) NULL AFTER handover_method',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deliveries' AND COLUMN_NAME = 'dropoff_distance_m'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE deliveries ADD COLUMN dropoff_distance_m INT NULL AFTER dropoff_photo_url',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deliveries' AND COLUMN_NAME = 'dropoff_flagged'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE deliveries ADD COLUMN dropoff_flagged TINYINT(1) NOT NULL DEFAULT 0 AFTER dropoff_distance_m',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deliveries' AND COLUMN_NAME = 'pickup_confirmed_at'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE deliveries ADD COLUMN pickup_confirmed_at TIMESTAMP NULL AFTER dropoff_flagged',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deliveries' AND COLUMN_NAME = 'pickup_photo_url'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE deliveries ADD COLUMN pickup_photo_url VARCHAR(500) NULL AFTER pickup_confirmed_at',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---- Booking refund records (P0) -----------------------------------------
-- Bookings previously had no tracked refund row at all - cancelBooking
-- just fire-and-forget called the payment provider directly, with no
-- pending/succeeded/failed record for an admin queue to ever see.
-- Reuses the existing `refunds` table (the same one dispute/return/
-- cancellation refunds already go through) rather than a parallel
-- booking_refunds table, so retryRefund, the admin queue and its
-- /admin/refunds routes all work for bookings with no extra code path.
--
-- This also repairs a pre-existing bug in chk_refunds_one_source
-- (migration 083): that CHECK only ever allowed exactly one of
-- dispute_id/return_id to be set, but order.service.js's cancellation
-- refunds (order.id only, both dispute_id and return_id NULL - see
-- refund.repository.js's own comment above autoRefundForCancellation's
-- insert) violate it. The replacement constraint allows exactly one of
-- dispute_id/return_id/booking_id, OR all three NULL (the cancellation
-- case).

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refunds' AND COLUMN_NAME = 'booking_id'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE refunds ADD COLUMN booking_id INT NULL UNIQUE AFTER return_id, ADD CONSTRAINT fk_refunds_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- order_id/payment_id are NOT NULL on `refunds` (migration 038) - a
-- booking refund has neither (payments.booking_id is the FK for a
-- booking payment, not payments.order_id). Widen both to nullable so a
-- booking-sourced row can omit them; every existing dispute/return/
-- cancellation row already has a real order_id/payment_id and is
-- unaffected by making the column merely *allow* NULL.
SET @col_nullable = (
    SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refunds' AND COLUMN_NAME = 'order_id'
);
SET @sql = IF(@col_nullable = 'NO',
    'ALTER TABLE refunds MODIFY order_id INT NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_nullable = (
    SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refunds' AND COLUMN_NAME = 'payment_id'
);
SET @sql = IF(@col_nullable = 'NO',
    'ALTER TABLE refunds MODIFY payment_id INT NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @constraint_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refunds' AND CONSTRAINT_NAME = 'chk_refunds_one_source'
);
SET @sql = IF(@constraint_exists > 0,
    'ALTER TABLE refunds DROP CHECK chk_refunds_one_source',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @constraint_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refunds' AND CONSTRAINT_NAME = 'chk_refunds_one_source_v2'
);
SET @sql = IF(@constraint_exists = 0,
    'ALTER TABLE refunds ADD CONSTRAINT chk_refunds_one_source_v2 CHECK (
        (dispute_id IS NOT NULL AND return_id IS NULL AND booking_id IS NULL) OR
        (dispute_id IS NULL AND return_id IS NOT NULL AND booking_id IS NULL) OR
        (dispute_id IS NULL AND return_id IS NULL AND booking_id IS NOT NULL) OR
        (dispute_id IS NULL AND return_id IS NULL AND booking_id IS NULL)
    )',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- provider ENUM needs to also cover whichever methods bookings can be
-- paid with (migration 121 already widened it for orders - this just
-- confirms wallet/malipopay_card are present, idempotent either way).
SET @sql := 'ALTER TABLE refunds MODIFY COLUMN provider ENUM(''mobile_money'', ''snippe'', ''malipopay_card'', ''paypal'', ''wallet'', ''cash_on_delivery'') NOT NULL';
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---- Booking refunds (P0) -----------------------------------------------

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'payer_phone_encrypted'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE payments ADD COLUMN payer_phone_encrypted VARCHAR(255) NULL AFTER method',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'cancellation_free_until_days'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE services ADD COLUMN cancellation_free_until_days INT NOT NULL DEFAULT 1 AFTER base_price',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'cancellation_late_fee_percent'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE services ADD COLUMN cancellation_late_fee_percent DECIMAL(5, 2) NOT NULL DEFAULT 0 AFTER cancellation_free_until_days',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---- Settings (return window, dispute response window) -----------------

INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('return_window_days', '7'),
    ('return_window_insured_days', '14'),
    ('dispute_seller_response_hours', '72')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

-- ---- EFD retry bookkeeping (P1) -----------------------------------------

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'efd_receipts' AND COLUMN_NAME = 'retry_count'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE efd_receipts ADD COLUMN retry_count INT NOT NULL DEFAULT 0 AFTER status',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'efd_receipts' AND COLUMN_NAME = 'last_retry_at'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE efd_receipts ADD COLUMN last_retry_at TIMESTAMP NULL AFTER retry_count',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- order_id on efd_receipts may point at a credit-note-eligible receipt;
-- a dedicated column tracks whether a credit note / void has already
-- been issued for a given refund/return/cancellation so the retry job
-- doesn't double-submit one to the tax authority.
SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'efd_receipts' AND COLUMN_NAME = 'credit_note_status'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE efd_receipts ADD COLUMN credit_note_status ENUM(''none'', ''pending'', ''issued'', ''failed'') NOT NULL DEFAULT ''none'' AFTER last_retry_at',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
