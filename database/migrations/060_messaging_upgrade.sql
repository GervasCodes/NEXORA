-- Phase 4 - Messaging Upgrade
--
-- messages.delivered_at / read_at: per-message delivery + read receipts.
--   `is_read` already existed (set in bulk by "mark conversation read");
--   `read_at` records *when* that happened so the UI can show a
--   timestamp, not just a boolean. `delivered_at` is new - it's set the
--   first time the recipient's client has the message (either it was
--   fetched over REST, or their socket was already in the room when it
--   was sent), independent of whether they've actually read it yet -
--   this is what lets the sender's bubble show a single check
--   ("sent"), double check ("delivered"), or double blue check ("read"),
--   same as WhatsApp/Telegram.
--
-- messages.attachment_* : a message can carry at most one attachment
-- (an image, document, audio or video clip). Kept as columns on the
-- message itself rather than a child table since a chat attachment
-- always belongs to exactly one message and is never shared across
-- messages (unlike e.g. review_photos, which can be queried on their
-- own) - one row stays enough to render or download it.
--
-- message_reactions: small emoji reactions, WhatsApp/Slack style. One
-- reactor can react with more than one distinct emoji to the same
-- message, but not the same emoji twice (UNIQUE below).

ALTER TABLE messages
    ADD COLUMN delivered_at TIMESTAMP NULL AFTER is_read,
    ADD COLUMN read_at TIMESTAMP NULL AFTER delivered_at,
    ADD COLUMN attachment_url VARCHAR(500) NULL AFTER message,
    ADD COLUMN attachment_type ENUM('image', 'video', 'audio', 'file') NULL AFTER attachment_url,
    ADD COLUMN attachment_name VARCHAR(255) NULL AFTER attachment_type,
    ADD COLUMN attachment_size INT NULL AFTER attachment_name;

-- A message previously always required text; attachments make that
-- optional (an image can be sent with no caption).
ALTER TABLE messages
    MODIFY COLUMN message VARCHAR(2000) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS message_reactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    user_id INT NOT NULL,
    emoji VARCHAR(8) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_message_reactions_message
        FOREIGN KEY (message_id) REFERENCES messages(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_message_reactions_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_message_reaction UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);

-- Supports in-conversation message search (Phase 4). A plain index
-- rather than FULLTEXT: FULLTEXT's default minimum token length (4
-- chars on InnoDB) would silently fail to match short words that are
-- common in chat ("hi", "yes", "ok", order numbers), so search is a
-- bounded LIKE scan per-conversation instead - conversations are small
-- enough that this doesn't need FULLTEXT's ranking machinery.
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at);
