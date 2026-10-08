-- Migration 139: Widen notifications.message (fix: broadcast in-app send failing)
--
-- notifications.message was VARCHAR(500) (see schema/notifications.sql).
-- Admin broadcasts routed through the in_app channel send the SAME body
-- used for email/SMS/WhatsApp into notification.service.js#notify(),
-- which inserts it as-is - see notification.repository.js#create. A
-- normal announcement email body (greeting + a few paragraphs + a link)
-- clears 500 characters easily, so every in_app broadcast send for
-- every recipient was failing with ER_DATA_TOO_LONG (1406) and silently
-- logged as a per-recipient broadcast send error (see
-- broadcast.service.js's catch block), while sendBroadcast still
-- reported inAppSentCount as if nothing went wrong.
--
-- Widened to TEXT (same type already used by broadcasts.message, see
-- migrations/107_broadcasts.sql) rather than a larger VARCHAR, since
-- there's no real reason to cap this tighter than the source content
-- already is (see 140_broadcast_channel_content.sql's 1000-char
-- in_app_message validator limit for where that cap now actually lives).
ALTER TABLE notifications
    MODIFY COLUMN message TEXT NOT NULL;
