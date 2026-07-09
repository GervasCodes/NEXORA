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
    await exports.assertParticipant(conversationId, userId);
    return chatRepository.findMessages(conversationId);
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
