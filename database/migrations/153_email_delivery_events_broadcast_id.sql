-- Migration 153: attribute Brevo delivery events to the broadcast that sent them.
-- Run after 152_google_signin.sql.
--
-- Migration 111 recorded delivery events system-wide only. sendBroadcast now
-- creates its `broadcasts` row BEFORE sending and tags every outgoing email
-- with `broadcast-<id>` (Brevo echoes tags back on webhook events), so the
-- webhook can fill this column in. NULL for transactional mail and for every
-- event received before this migration. Deliberately no FK: a webhook event
-- carrying a stale/unknown id must still be recorded, not rejected.

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'email_delivery_events'
          AND COLUMN_NAME = 'broadcast_id') = 0,
    'ALTER TABLE email_delivery_events ADD COLUMN broadcast_id INT NULL AFTER brevo_message_id',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'email_delivery_events'
          AND INDEX_NAME = 'idx_email_delivery_events_broadcast') = 0,
    'ALTER TABLE email_delivery_events ADD INDEX idx_email_delivery_events_broadcast (broadcast_id, event_type)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
