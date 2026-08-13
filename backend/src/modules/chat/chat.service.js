const chatRepository = require("./chat.repository");
const logger = require("../../utils/logger").child({ module: "chat" });
const notificationService = require("../notification/notification.service");
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");

// Buckets a multer mimetype into the ENUM stored on messages.attachment_type.
const attachmentTypeFor = (mimetype) => {
    if (mimetype.startsWith("image/")) return "image";
    if (mimetype.startsWith("video/")) return "video";
    if (mimetype.startsWith("audio/")) return "audio";
    return "file";
};

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

exports.getUnreadCount = async (userId) => {
    return chatRepository.countUnreadMessages(userId);
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

// Groups a flat list of reaction rows ({message_id, emoji, user_id}) into
// { [messageId]: [{ emoji, count, userIds, mine }] } - shared by
// getMessages() and searchMessages() result shaping.
const groupReactions = (rows, viewerId) => {
    const byMessage = {};
    for (const row of rows) {
        const bucket = (byMessage[row.message_id] ||= {});
        const entry = (bucket[row.emoji] ||= { emoji: row.emoji, count: 0, userIds: [], mine: false });
        entry.count += 1;
        entry.userIds.push(row.user_id);
        if (row.user_id === viewerId) entry.mine = true;
    }
    const result = {};
    for (const [messageId, emojis] of Object.entries(byMessage)) {
        result[messageId] = Object.values(emojis);
    }
    return result;
};

exports.getMessages = async (conversationId, userId) => {
    const conversation = await exports.assertParticipant(conversationId, userId);
    const clearedColumn = chatRepository.clearedColumnFor(conversation, userId);
    const clearedAt = clearedColumn ? conversation[clearedColumn] : null;

    const [messages, reactionRows] = await Promise.all([
        chatRepository.findMessages(conversationId, clearedAt),
        chatRepository.findReactionsForConversation(conversationId, clearedAt)
    ]);

    // Best-effort: opening a conversation is when the recipient's client
    // "has" any not-yet-delivered messages, so this is where delivered_at
    // gets backfilled for anyone who wasn't live in the socket room when
    // the message was originally sent (offline/backgrounded case).
    chatRepository.markDelivered(conversationId, userId).catch(() => {});

    const reactionsByMessage = groupReactions(reactionRows, userId);
    return messages.map((m) => ({ ...m, reactions: reactionsByMessage[m.id] || [] }));
};

exports.sendMessage = async (conversationId, senderId, message, attachment) => {
    const text = (message || "").trim();

    if (!text && !attachment) {
        throw new Error("Message cannot be empty");
    }

    const conversation = await exports.assertParticipant(conversationId, senderId);

    const messageId = await chatRepository.createMessage(
        conversationId,
        senderId,
        text,
        attachment
    );

    await chatRepository.touchConversation(conversationId);

    const saved = {
        id: messageId,
        conversation_id: conversationId,
        sender_id: senderId,
        message: text,
        attachment_url: attachment?.url || null,
        attachment_type: attachment?.type || null,
        attachment_name: attachment?.name || null,
        attachment_size: attachment?.size || null,
        is_read: false,
        delivered_at: null,
        read_at: null,
        reactions: [],
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

    // Notify whichever other participant(s) exist on this conversation -
    // buyer/seller/delivery_agent, whichever of the three isn't the sender.
    // This is what makes a message reach someone whose tab is closed or
    // backgrounded (the emitNewMessage above only reaches a tab that's
    // actually joined this conversation's socket room right now): it writes
    // a normal notification row (shows in the bell) and, via
    // notificationService.notify, fires the same real-time socket +
    // web-push fan-out every other event type in the app already uses.
    const recipientIds = [conversation.buyer_id, conversation.seller_id, conversation.delivery_agent_id].filter(
        (id) => id && id !== senderId
    );
    const attachmentLabel = { image: "📷 Photo", video: "🎥 Video", audio: "🎵 Audio", file: "📎 File" }[
        attachment?.type
    ];
    const preview = text
        ? (text.length > 120 ? `${text.slice(0, 117)}...` : text)
        : (attachmentLabel || "New message");
    recipientIds.forEach((recipientId) => {
        notificationService
            .notify({
                userId: recipientId,
                type: "message",
                titleKey: "message.new.title",
                messageKey: "message.new.message",
                messageParams: { preview },
                url: `/messages/${conversationId}`
            })
            .catch((error) => logger.warn({ err: error, conversationId }, "message notification error"));
    });

    return saved;
};

// Uploads the file then delegates to sendMessage so attachments go
// through the exact same broadcast/notify path as a text message -
// an attachment message is just a message with a caption attached to it.
exports.sendAttachment = async (conversationId, senderId, file, caption) => {
    if (!file) {
        throw new Error("No file uploaded");
    }

    const resourceType = file.mimetype.startsWith("video/") || file.mimetype.startsWith("audio/")
        ? "video" // Cloudinary treats audio uploads under the "video" resource type
        : file.mimetype.startsWith("image/")
            ? "image"
            : "raw";

    const result = await uploadToCloudinary(file.buffer, "nexora/chat", resourceType);

    const attachment = {
        url: result.secure_url,
        type: attachmentTypeFor(file.mimetype),
        name: file.originalname,
        size: file.size
    };

    return exports.sendMessage(conversationId, senderId, caption, attachment);
};

exports.markAsRead = async (conversationId, userId) => {
    await exports.assertParticipant(conversationId, userId);
    await chatRepository.markMessagesRead(conversationId, userId);

    // Lets the sender's open thread flip their sent messages'
    // checkmarks to "read" live, instead of only on their next fetch.
    try {
        const socket = require("../../socket/socket");
        socket.emitMessagesRead(conversationId, { conversation_id: Number(conversationId), reader_id: userId });
    } catch (error) {
        // Socket layer being unavailable should never break read receipts
    }
};

// A short, curated set is enforced here (rather than accepting any
// string) so a reaction always renders as a single emoji glyph and
// can't be used to smuggle arbitrary text into what's meant to be a
// lightweight, non-conversational reaction.
const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"];

exports.reactToMessage = async (conversationId, messageId, userId, emoji) => {
    if (!ALLOWED_REACTIONS.includes(emoji)) {
        throw new Error("That reaction isn't supported");
    }

    await exports.assertParticipant(conversationId, userId);

    const message = await chatRepository.findMessageById(messageId);
    if (!message || String(message.conversation_id) !== String(conversationId) || message.is_deleted) {
        throw new Error("Message not found");
    }

    await chatRepository.addReaction(messageId, userId, emoji);
    const reactions = await chatRepository.findReactionsForMessage(messageId);

    const payload = { conversation_id: Number(conversationId), message_id: Number(messageId), reactions };
    try {
        const socket = require("../../socket/socket");
        socket.emitReactionUpdated(conversationId, payload);
    } catch (error) {
        // Socket layer being unavailable should never break reactions
    }

    return payload;
};

exports.removeReaction = async (conversationId, messageId, userId, emoji) => {
    await exports.assertParticipant(conversationId, userId);

    const message = await chatRepository.findMessageById(messageId);
    if (!message || String(message.conversation_id) !== String(conversationId)) {
        throw new Error("Message not found");
    }

    await chatRepository.removeReaction(messageId, userId, emoji);
    const reactions = await chatRepository.findReactionsForMessage(messageId);

    const payload = { conversation_id: Number(conversationId), message_id: Number(messageId), reactions };
    try {
        const socket = require("../../socket/socket");
        socket.emitReactionUpdated(conversationId, payload);
    } catch (error) {
        // Socket layer being unavailable should never break reactions
    }

    return payload;
};

exports.searchMessages = async (conversationId, userId, query) => {
    const trimmed = (query || "").trim();
    if (!trimmed) return [];

    const conversation = await exports.assertParticipant(conversationId, userId);
    const clearedColumn = chatRepository.clearedColumnFor(conversation, userId);
    const clearedAt = clearedColumn ? conversation[clearedColumn] : null;

    return chatRepository.searchMessages(conversationId, trimmed, clearedAt);
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
