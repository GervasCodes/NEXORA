-- Migration 103: Phase 6 (Notifications - UI/UX remediation deep-dive)
--
-- Adds related_conversation_id to notifications, mirroring the existing
-- related_order_id column/pattern. chat.service.js's sendMessage already
-- builds a `url: /messages/{conversationId}` for the real-time socket
-- payload (see notification.service.js's notify()), but that url was
-- never persisted to the row itself - so a message notification fetched
-- later via GET /notifications (page reload, panel opened after the
-- fact) carried no way to know which conversation it came from. This
-- column is that missing pointer.
--
-- Nullable + ON DELETE SET NULL, same as related_order_id: a deleted
-- conversation shouldn't take the notification's history down with it,
-- it should just stop being clickable to a conversation that's gone.
ALTER TABLE notifications
    ADD COLUMN related_conversation_id INT NULL AFTER related_order_id,
    ADD CONSTRAINT fk_notifications_conversation
        FOREIGN KEY (related_conversation_id) REFERENCES conversations(id)
        ON DELETE SET NULL,
    ADD INDEX idx_notifications_conversation (related_conversation_id);
