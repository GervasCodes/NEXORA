-- Migration 118: In-app broadcast channel (Fix Plan Phase 1.2)
--
-- Broadcasts could previously only be sent by email/SMS/WhatsApp -
-- there was no way to land a broadcast in a logged-in user's own
-- in-app notification feed (NotificationBell.jsx). This adds the
-- counter column mirroring email_sent_count/sms_sent_count/
-- whatsapp_sent_count for the new "in_app" channel; see
-- broadcast.service.js for how it's populated (reuses the existing
-- notification.service.js#notify() creation+socket-emit path rather
-- than a parallel mechanism).
ALTER TABLE broadcasts
    ADD COLUMN in_app_sent_count INT NOT NULL DEFAULT 0 AFTER whatsapp_sent_count;
