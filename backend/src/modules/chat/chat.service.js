const chatRepository = require("./chat.repository");

// Start (or resume) a conversation. Always called with a buyer_id + the
// other party's id/role; the controller works out which one is "me".
// otherRole is 'seller' (context: product_id) or 'delivery_agent' (context: order_id).
exports.startConversation = async (buyerId, otherUserId, otherRole, contextId) => {
    if (buyerId === otherUserId) {
        throw new Error("You can't start a conversation with yourself");
    }

    const actualRole = await chatRepository.findUserRole(otherUserId);

    if (actualRole !== otherRole) {
        throw new Error("That user isn't available for this kind of conversation");
    }

    const existing = await chatRepository.findConversation(buyerId, otherUserId, otherRole, contextId);

    if (existing) {
        return existing;
    }

    const conversationId = await chatRepository.createConversation(
        buyerId,
        otherUserId,
        otherRole,
        contextId
    );

    return chatRepository.findConversationById(conversationId);
};

exports.getMyConversations = async (userId) => {
    return chatRepository.findConversationsByUser(userId);
};

// Throws if the given user isn't a participant in the conversation
exports.assertParticipant = async (conversationId, userId) => {
    const conversation = await chatRepository.findConversationById(conversationId);

    if (!conversation) {
        throw new Error("Conversation not found");
    }

    if (
        conversation.buyer_id !== userId &&
        conversation.seller_id !== userId &&
        conversation.delivery_agent_id !== userId
    ) {
        throw new Error("Conversation not found");
    }

    return conversation;
};

exports.getMessages = async (conversationId, userId) => {
    const conversation = await exports.assertParticipant(conversationId, userId);
    const clearedColumn = chatRepository.clearedColumnFor(conversation, userId);
    const clearedAt = clearedColumn ? conversation[clearedColumn] : null;
    return chatRepository.findMessages(conversationId, clearedAt);
};

exports.sendMessage = async (conversationId, senderId, message) => {
    if (!message || !message.trim()) {
        throw new Error("Message cannot be empty");
    }

    await exports.assertParticipant(conversationId, senderId);

    const messageId = await chatRepository.createMessage(
        conversationId,
        senderId,
        message.trim()
    );

    await chatRepository.touchConversation(conversationId);

    const saved = {
        id: messageId,
        conversation_id: conversationId,
        sender_id: senderId,
        message: message.trim(),
        is_read: false,
        created_at: new Date()
    };

    // Broadcast to anyone connected in real time. Lazy require avoids a
    // circular dependency with socket.js (which also calls into this service).
    try {
        const socket = require("../../socket/socket");
        socket.emitNewMessage(conversationId, saved);
    } catch (error) {
        // Socket layer being unavailable should never break message sending
    }

    return saved;
};

exports.markAsRead = async (conversationId, userId) => {
    await exports.assertParticipant(conversationId, userId);
    await chatRepository.markMessagesRead(conversationId, userId);
};

// "Delete message" - sender only, delete-for-everyone. The bubble stays
// in place (so the thread doesn't visually reflow) but renders as a
// tombstone for both participants.
exports.deleteMessage = async (conversationId, messageId, userId) => {
    await exports.assertParticipant(conversationId, userId);

    const message = await chatRepository.findMessageById(messageId);

    if (!message || String(message.conversation_id) !== String(conversationId)) {
        throw new Error("Message not found");
    }

    if (message.sender_id !== userId) {
        throw new Error("You can only delete your own messages");
    }

    if (message.is_deleted) {
        return { id: messageId, already_deleted: true };
    }

    await chatRepository.softDeleteMessage(messageId);

    const payload = { id: Number(messageId), conversation_id: Number(conversationId) };

    try {
        const socket = require("../../socket/socket");
        socket.emitMessageDeleted(conversationId, payload);
    } catch (error) {
        // Socket layer being unavailable should never break deletion
    }

    return payload;
};

// "Clear chat" - per-user only. Hides everything up to now for the
// requesting participant; the other participant's copy is untouched.
exports.clearConversation = async (conversationId, userId) => {
    const conversation = await exports.assertParticipant(conversationId, userId);
    const clearedColumn = chatRepository.clearedColumnFor(conversation, userId);

    if (!clearedColumn) {
        throw new Error("Conversation not found");
    }

    await chatRepository.setClearedAt(conversationId, clearedColumn);
};

// "Delete chat" - per-user, list-level. Removes the entire conversation
// from the requesting participant's Messages list and, like "clear chat",
// hides its message history for them going forward. The other
// participant's list/thread is untouched. If a new message arrives later
// the thread reappears in the list (same behavior as WhatsApp/Telegram).
exports.deleteConversation = async (conversationId, userId) => {
    const conversation = await exports.assertParticipant(conversationId, userId);

    const deletedColumn = chatRepository.deletedColumnFor(conversation, userId);
    const clearedColumn = chatRepository.clearedColumnFor(conversation, userId);

    if (!deletedColumn || !clearedColumn) {
        throw new Error("Conversation not found");
    }

    await chatRepository.setDeletedAt(conversationId, deletedColumn);
    await chatRepository.setClearedAt(conversationId, clearedColumn);
};
