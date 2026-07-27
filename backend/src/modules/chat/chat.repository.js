const db = require("../../config/db");

// otherRole is 'seller' or 'delivery_agent' - determines which column holds
// the non-buyer participant, and which context column (product vs order) applies.
const otherColumn = (otherRole) => (otherRole === "delivery_agent" ? "delivery_agent_id" : "seller_id");
const contextColumn = (otherRole) => (otherRole === "delivery_agent" ? "order_id" : "product_id");

// Which "cleared_at" column belongs to a given user in a conversation they
// participate in (as buyer / seller / delivery agent).
const clearedColumnFor = (conversation, userId) => {
    if (conversation.buyer_id === userId) return "buyer_cleared_at";
    if (conversation.seller_id === userId) return "seller_cleared_at";
    if (conversation.delivery_agent_id === userId) return "agent_cleared_at";
    return null;
};
exports.clearedColumnFor = clearedColumnFor;

// Which "deleted_at" column belongs to a given user in a conversation they
// participate in. Used for "delete chat" - removes the thread from that
// user's Messages list (distinct from clearedColumnFor, which only hides
// message history but keeps the thread listed).
const deletedColumnFor = (conversation, userId) => {
    if (conversation.buyer_id === userId) return "buyer_deleted_at";
    if (conversation.seller_id === userId) return "seller_deleted_at";
    if (conversation.delivery_agent_id === userId) return "agent_deleted_at";
    return null;
};
exports.deletedColumnFor = deletedColumnFor;

exports.findUserRole = async (userId) => {
    const [rows] = await db.query("SELECT role FROM users WHERE id = ?", [userId]);
    return rows[0]?.role;
};

exports.findConversation = async (buyerId, otherUserId, otherRole, contextId) => {
    const otherCol = otherColumn(otherRole);
    const ctxCol = contextColumn(otherRole);

    const [rows] = await db.query(
        `SELECT * FROM conversations
        WHERE buyer_id = ? AND ${otherCol} = ?
        AND ${contextId ? `${ctxCol} = ?` : `${ctxCol} IS NULL`}`,
        contextId ? [buyerId, otherUserId, contextId] : [buyerId, otherUserId]
    );
    return rows[0];
};

exports.createConversation = async (buyerId, otherUserId, otherRole, contextId) => {
    const otherCol = otherColumn(otherRole);
    const ctxCol = contextColumn(otherRole);

    const [result] = await db.query(
        `INSERT INTO conversations (buyer_id, ${otherCol}, ${ctxCol})
        VALUES (?, ?, ?)`,
        [buyerId, otherUserId, contextId || null]
    );
    return result.insertId;
};

exports.findConversationById = async (conversationId) => {
    const [rows] = await db.query(
        "SELECT * FROM conversations WHERE id = ?",
        [conversationId]
    );
    return rows[0];
};

exports.findConversationsByUser = async (userId) => {
    const [rows] = await db.query(
        `SELECT c.*,
                p.name AS product_name,
                o.order_number,
                buyer.first_name AS buyer_first_name, buyer.last_name AS buyer_last_name,
                seller.first_name AS seller_first_name, seller.last_name AS seller_last_name,
                agent.first_name AS agent_first_name, agent.last_name AS agent_last_name,
                CASE
                    WHEN c.buyer_id = ? THEN c.buyer_cleared_at
                    WHEN c.seller_id = ? THEN c.seller_cleared_at
                    WHEN c.delivery_agent_id = ? THEN c.agent_cleared_at
                END AS my_cleared_at,
                (
                    SELECT CASE
                        WHEN m.is_deleted THEN 'Message deleted'
                        WHEN m.message = '' AND m.attachment_type = 'image' THEN '📷 Photo'
                        WHEN m.message = '' AND m.attachment_type = 'video' THEN '🎥 Video'
                        WHEN m.message = '' AND m.attachment_type = 'audio' THEN '🎵 Audio'
                        WHEN m.message = '' AND m.attachment_type = 'file' THEN '📎 File'
                        ELSE m.message
                    END
                    FROM messages m
                    WHERE m.conversation_id = c.id
                    AND (
                        (c.buyer_id = ? AND (c.buyer_cleared_at IS NULL OR m.created_at > c.buyer_cleared_at)) OR
                        (c.seller_id = ? AND (c.seller_cleared_at IS NULL OR m.created_at > c.seller_cleared_at)) OR
                        (c.delivery_agent_id = ? AND (c.agent_cleared_at IS NULL OR m.created_at > c.agent_cleared_at))
                    )
                    ORDER BY m.created_at DESC LIMIT 1
                ) AS last_message,
                (
                    SELECT COUNT(*) FROM messages m
                    WHERE m.conversation_id = c.id
                    AND m.sender_id != ? AND m.is_read = 0
                    AND m.is_deleted = 0
                    AND (
                        (c.buyer_id = ? AND (c.buyer_cleared_at IS NULL OR m.created_at > c.buyer_cleared_at)) OR
                        (c.seller_id = ? AND (c.seller_cleared_at IS NULL OR m.created_at > c.seller_cleared_at)) OR
                        (c.delivery_agent_id = ? AND (c.agent_cleared_at IS NULL OR m.created_at > c.agent_cleared_at))
                    )
                ) AS unread_count
        FROM conversations c
        LEFT JOIN products p ON p.id = c.product_id
        LEFT JOIN orders o ON o.id = c.order_id
        JOIN users buyer ON buyer.id = c.buyer_id
        LEFT JOIN users seller ON seller.id = c.seller_id
        LEFT JOIN users agent ON agent.id = c.delivery_agent_id
        WHERE (c.buyer_id = ? OR c.seller_id = ? OR c.delivery_agent_id = ?)
        AND NOT (
            (c.buyer_id = ? AND c.buyer_deleted_at IS NOT NULL AND c.updated_at <= c.buyer_deleted_at) OR
            (c.seller_id = ? AND c.seller_deleted_at IS NOT NULL AND c.updated_at <= c.seller_deleted_at) OR
            (c.delivery_agent_id = ? AND c.agent_deleted_at IS NOT NULL AND c.updated_at <= c.agent_deleted_at)
        )
        ORDER BY c.updated_at DESC`,
        [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId]
    );
    return rows;
};

exports.touchConversation = async (conversationId) => {
    await db.query(
        "UPDATE conversations SET updated_at = NOW() WHERE id = ?",
        [conversationId]
    );
};

// `attachment` is optional: { url, type, name, size } or null/undefined.
exports.createMessage = async (conversationId, senderId, message, attachment) => {
    const [result] = await db.query(
        `INSERT INTO messages (conversation_id, sender_id, message, attachment_url, attachment_type, attachment_name, attachment_size)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            conversationId,
            senderId,
            message || "",
            attachment?.url || null,
            attachment?.type || null,
            attachment?.name || null,
            attachment?.size || null
        ]
    );
    return result.insertId;
};

// `clearedAt`: when set, messages sent before this timestamp are hidden -
// this is what makes "clear chat" per-user (it never touches the other
// participant's copy, and never actually deletes rows other people may
// still need for order/dispute history).
exports.findMessages = async (conversationId, clearedAt) => {
    const [rows] = await db.query(
        `SELECT id, sender_id, message, attachment_url, attachment_type, attachment_name, attachment_size,
                is_read, delivered_at, read_at, is_deleted, created_at
        FROM messages
        WHERE conversation_id = ?
        ${clearedAt ? "AND created_at > ?" : ""}
        ORDER BY created_at ASC`,
        clearedAt ? [conversationId, clearedAt] : [conversationId]
    );
    return rows;
};

// Every reaction row for every (non-tombstoned) message in the given
// conversation, in one query - findMessages() callers group these by
// message_id in the service layer rather than issuing one query per
// message.
exports.findReactionsForConversation = async (conversationId, clearedAt) => {
    const [rows] = await db.query(
        `SELECT r.message_id, r.emoji, r.user_id
        FROM message_reactions r
        JOIN messages m ON m.id = r.message_id
        WHERE m.conversation_id = ?
        ${clearedAt ? "AND m.created_at > ?" : ""}`,
        clearedAt ? [conversationId, clearedAt] : [conversationId]
    );
    return rows;
};

exports.markMessagesRead = async (conversationId, readerId) => {
    await db.query(
        `UPDATE messages
        SET is_read = 1, read_at = COALESCE(read_at, NOW()), delivered_at = COALESCE(delivered_at, NOW())
        WHERE conversation_id = ? AND sender_id != ? AND is_read = 0`,
        [conversationId, readerId]
    );
};

// Marks messages as having reached the recipient's client, without
// necessarily having been read yet - powers the single-check vs
// double-check distinction in the UI. Called whenever a participant
// fetches/opens a conversation.
exports.markDelivered = async (conversationId, recipientId) => {
    await db.query(
        `UPDATE messages
        SET delivered_at = NOW()
        WHERE conversation_id = ? AND sender_id != ? AND delivered_at IS NULL`,
        [conversationId, recipientId]
    );
};

exports.addReaction = async (messageId, userId, emoji) => {
    await db.query(
        `INSERT IGNORE INTO message_reactions (message_id, user_id, emoji)
        VALUES (?, ?, ?)`,
        [messageId, userId, emoji]
    );
};

exports.removeReaction = async (messageId, userId, emoji) => {
    await db.query(
        `DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`,
        [messageId, userId, emoji]
    );
};

exports.findReactionsForMessage = async (messageId) => {
    const [rows] = await db.query(
        `SELECT emoji, user_id FROM message_reactions WHERE message_id = ?`,
        [messageId]
    );
    return rows;
};

// Bounded LIKE search within one conversation - see the comment on
// idx_messages_conversation_created in migration 060 for why this isn't
// FULLTEXT. `clearedAt` is applied the same way as findMessages(), so a
// search never surfaces something the user has "cleared" from view.
//
// The search term is escaped before being wrapped in %...% - otherwise a
// literal "%" or "_" typed by the user (e.g. "50% off", "SAVE_10") would
// be reinterpreted by MySQL as a LIKE wildcard instead of matched as
// plain text, silently broadening the results. Backslash is escaped too
// since it's what makes the escaping itself work (and MySQL's LIKE
// treats backslash as its own escape character by default).
const escapeLikePattern = (str) => str.replace(/[\\%_]/g, (ch) => `\\${ch}`);

exports.searchMessages = async (conversationId, query, clearedAt) => {
    const likePattern = `%${escapeLikePattern(query)}%`;
    const [rows] = await db.query(
        `SELECT id, sender_id, message, attachment_url, attachment_type, attachment_name, created_at
        FROM messages
        WHERE conversation_id = ? AND is_deleted = 0 AND message LIKE ?
        ${clearedAt ? "AND created_at > ?" : ""}
        ORDER BY created_at DESC
        LIMIT 50`,
        clearedAt ? [conversationId, likePattern, clearedAt] : [conversationId, likePattern]
    );
    return rows;
};

exports.findMessageById = async (messageId) => {
    const [rows] = await db.query("SELECT * FROM messages WHERE id = ?", [messageId]);
    return rows[0];
};

// "Delete message" (sender only, delete-for-everyone): content is wiped
// and is_deleted set, rather than removing the row - so message ordering,
// unread counts, and any order/dispute audit trail relying on the
// conversation stay intact, and the other participant sees a tombstone
// instead of the chat silently reflowing.
exports.softDeleteMessage = async (messageId) => {
    await db.query(
        `UPDATE messages
        SET message = '', is_deleted = TRUE, deleted_at = NOW()
        WHERE id = ?`,
        [messageId]
    );
};

exports.setClearedAt = async (conversationId, clearedColumn) => {
    await db.query(
        `UPDATE conversations SET ${clearedColumn} = NOW() WHERE id = ?`,
        [conversationId]
    );
};

// "Delete chat" (list-level, per-user): stamps this user's deleted_at
// column. The conversation stops appearing in findConversationsByUser for
// them until a new message bumps conversations.updated_at again.
exports.setDeletedAt = async (conversationId, deletedColumn) => {
    await db.query(
        `UPDATE conversations SET ${deletedColumn} = NOW() WHERE id = ?`,
        [conversationId]
    );
};
