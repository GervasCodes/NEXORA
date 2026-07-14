-- "Delete chat" (per-user, list-level): removes the entire conversation
-- from the requesting participant's Messages list (unlike "clear chat",
-- which only hides message history but leaves the thread in the list).
-- The conversation is never actually removed - the other participant's
-- list is untouched, and if a new message arrives afterwards the thread
-- reappears in the list, same pattern as WhatsApp/Telegram "delete chat".
--
-- A conversation is hidden from a user's list when their *_deleted_at
-- column is set AND no message has updated the conversation since
-- (conversations.updated_at <= *_deleted_at).

ALTER TABLE conversations
    ADD COLUMN buyer_deleted_at TIMESTAMP NULL,
    ADD COLUMN seller_deleted_at TIMESTAMP NULL,
    ADD COLUMN agent_deleted_at TIMESTAMP NULL;
