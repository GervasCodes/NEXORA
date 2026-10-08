-- Migration 140: Per-channel broadcast content
--
-- Broadcasts previously sent ONE shared body (`message`) to every
-- selected channel - email, SMS, WhatsApp and in_app. In practice those
-- channels want very different content: an email can run several
-- paragraphs with a subject line, while an SMS is billed/truncated in
-- ~160-char segments and an in-app notification is read as one short
-- line in NotificationBell.jsx. Sharing one box meant either the email
-- copy got sent as an oversized SMS, or (the bug this phase also fixes,
-- see 139_widen_notification_message.sql) the full email body blew past
-- notifications.message's old VARCHAR(500) limit.
--
-- `message` keeps its existing meaning (the email body) for backward
-- compatibility with existing history rows. Each new column is NULL
-- when that channel wasn't part of the send, or when the admin left it
-- blank and broadcast.service.js fell back to `message`/`subject` -
-- see that file's resolveChannelContent.
ALTER TABLE broadcasts
    ADD COLUMN sms_message TEXT NULL AFTER message,
    ADD COLUMN whatsapp_message TEXT NULL AFTER sms_message,
    ADD COLUMN in_app_title VARCHAR(150) NULL AFTER whatsapp_message,
    ADD COLUMN in_app_message TEXT NULL AFTER in_app_title;
