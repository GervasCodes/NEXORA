const db = require("../../config/db");

// otherRole is 'seller' or 'delivery_agent' - determines which column holds
// the non-buyer participant, and which context column (product vs order) applies.
const otherColumn = (otherRole) => (otherRole === "delivery_agent" ? "delivery_agent_id" : "seller_id");
const contextColumn = (otherRole) => (otherRole === "delivery_agent" ? "order_id" : "product_id");

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
                (
                    SELECT m.message FROM messages m
                    WHERE m.conversation_id = c.id
                    ORDER BY m.created_at DESC LIMIT 1
                ) AS last_message,
                (
                    SELECT COUNT(*) FROM messages m
                    WHERE m.conversation_id = c.id
                    AND m.sender_id != ? AND m.is_read = 0
                ) AS unread_count
        FROM conversations c
        LEFT JOIN products p ON p.id = c.product_id
        LEFT JOIN orders o ON o.id = c.order_id
        JOIN users buyer ON buyer.id = c.buyer_id
        LEFT JOIN users seller ON seller.id = c.seller_id
        LEFT JOIN users agent ON agent.id = c.delivery_agent_id
        WHERE c.buyer_id = ? OR c.seller_id = ? OR c.delivery_agent_id = ?
        ORDER BY c.updated_at DESC`,
        [userId, userId, userId, userId]
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

exports.findMessages = async (conversationId) => {
    const [rows] = await db.query(
        `SELECT id, sender_id, message, is_read, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC`,
        [conversationId]
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
