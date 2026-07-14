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
                    SELECT CASE WHEN m.is_deleted THEN 'Message deleted' ELSE m.message END
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

exports.createMessage = async (conversationId, senderId, message) => {
    const [result] = await db.query(
        `INSERT INTO messages (conversation_id, sender_id, message)
        VALUES (?, ?, ?)`,
        [conversationId, senderId, message]
    );
    return result.insertId;
};

// `clearedAt`: when set, messages sent before this timestamp are hidden -
// this is what makes "clear chat" per-user (it never touches the other
// participant's copy, and never actually deletes rows other people may
// still need for order/dispute history).
exports.findMessages = async (conversationId, clearedAt) => {
    const [rows] = await db.query(
        `SELECT id, sender_id, message, is_read, is_deleted, created_at
        FROM messages
        WHERE conversation_id = ?
        ${clearedAt ? "AND created_at > ?" : ""}
        ORDER BY created_at ASC`,
        clearedAt ? [conversationId, clearedAt] : [conversationId]
    );
    return rows;
};

exports.markMessagesRead = async (conversationId, readerId) => {
    await db.query(
        `UPDATE messages
        SET is_read = 1
        WHERE conversation_id = ? AND sender_id != ?`,
        [conversationId, readerId]
    );
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
