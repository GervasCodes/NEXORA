-- Modern messaging support:
--   messages.is_deleted   - "delete message" (sender only). Content is
--                            cleared and the bubble renders as a tombstone
--                            ("This message was deleted") for everyone,
--                            same pattern as WhatsApp/Telegram.
--   conversations.*_cleared_at - "clear chat" is per-user: it hides
--                            everything up to that timestamp for the
--                            person who cleared it, without touching the
--                            other participant's copy of the conversation.

ALTER TABLE messages
    ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE AFTER is_read,
    ADD COLUMN deleted_at TIMESTAMP NULL AFTER is_deleted;

ALTER TABLE conversations
    ADD COLUMN buyer_cleared_at TIMESTAMP NULL,
    ADD COLUMN seller_cleared_at TIMESTAMP NULL,
    ADD COLUMN agent_cleared_at TIMESTAMP NULL;
