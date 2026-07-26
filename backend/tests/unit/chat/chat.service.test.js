jest.mock("../../../src/modules/chat/chat.repository");
jest.mock("../../../src/socket/socket");
jest.mock("../../../src/utils/cloudinaryUpload");

const chatRepository = require("../../../src/modules/chat/chat.repository");
const socket = require("../../../src/socket/socket");
const { uploadToCloudinary } = require("../../../src/utils/cloudinaryUpload");

const chatService = require("../../../src/modules/chat/chat.service");

// getMessages() fires markDelivered() and chains .catch() onto it without
// awaiting - the auto-mock otherwise resolves to `undefined` (not a
// Promise), which throws "Cannot read properties of undefined (reading
// 'catch')" the moment getMessages runs, in every test regardless of
// what it's actually asserting on.
beforeEach(() => {
    chatRepository.markDelivered.mockResolvedValue(undefined);
    chatRepository.findReactionsForConversation.mockResolvedValue([]);
});

describe("chat.service.startConversation", () => {
    it("rejects starting a conversation with yourself", async () => {
        await expect(chatService.startConversation(5, 5, "seller", 1)).rejects.toThrow(
            "You can't start a conversation with yourself"
        );
    });

    it("rejects when the other user's actual role doesn't match the requested role", async () => {
        chatRepository.findUserRole.mockResolvedValue("buyer");
        await expect(chatService.startConversation(5, 10, "seller", 1)).rejects.toThrow(
            "That user isn't available for this kind of conversation"
        );
    });

    it("returns the existing conversation instead of creating a duplicate", async () => {
        chatRepository.findUserRole.mockResolvedValue("seller");
        chatRepository.findConversation.mockResolvedValue({ id: 99 });

        const result = await chatService.startConversation(5, 10, "seller", 1);

        expect(result).toEqual({ id: 99 });
        expect(chatRepository.createConversation).not.toHaveBeenCalled();
    });

    it("creates a new conversation when none exists yet", async () => {
        chatRepository.findUserRole.mockResolvedValue("seller");
        chatRepository.findConversation.mockResolvedValue(undefined);
        chatRepository.createConversation.mockResolvedValue(101);
        chatRepository.findConversationById.mockResolvedValue({ id: 101 });

        const result = await chatService.startConversation(5, 10, "seller", 1);

        expect(chatRepository.createConversation).toHaveBeenCalledWith(5, 10, "seller", 1);
        expect(result).toEqual({ id: 101 });
    });
});

describe("chat.service.assertParticipant", () => {
    it("rejects an unknown conversation", async () => {
        chatRepository.findConversationById.mockResolvedValue(undefined);
        await expect(chatService.assertParticipant(1, 5)).rejects.toThrow("Conversation not found");
    });

    it("rejects a user who isn't buyer, seller, or delivery agent on the conversation", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10, delivery_agent_id: null });
        await expect(chatService.assertParticipant(1, 999)).rejects.toThrow("Conversation not found");
    });

    it("allows the buyer, seller, or delivery agent", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10, delivery_agent_id: 20 });

        await expect(chatService.assertParticipant(1, 5)).resolves.toBeDefined();
        await expect(chatService.assertParticipant(1, 10)).resolves.toBeDefined();
        await expect(chatService.assertParticipant(1, 20)).resolves.toBeDefined();
    });
});

describe("chat.service.getMessages", () => {
    it("only returns messages after the requester's own clear-point", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, buyer_cleared_at: "2026-07-01" });
        chatRepository.clearedColumnFor.mockReturnValue("buyer_cleared_at");
        chatRepository.findMessages.mockResolvedValue([{ id: 1 }]);

        const result = await chatService.getMessages(1, 5);

        expect(chatRepository.findMessages).toHaveBeenCalledWith(1, "2026-07-01");
        expect(result).toEqual([{ id: 1, reactions: [] }]);
    });

    it("passes null clearedAt when the user has never cleared the conversation", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, buyer_cleared_at: null });
        chatRepository.clearedColumnFor.mockReturnValue("buyer_cleared_at");
        chatRepository.findMessages.mockResolvedValue([]);

        await chatService.getMessages(1, 5);

        expect(chatRepository.findMessages).toHaveBeenCalledWith(1, null);
    });
});

describe("chat.service.sendMessage", () => {
    it("rejects an empty/whitespace-only message", async () => {
        await expect(chatService.sendMessage(1, 5, "   ")).rejects.toThrow("Message cannot be empty");
        expect(chatRepository.findConversationById).not.toHaveBeenCalled();
    });

    it("rejects a non-participant sender", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 999, seller_id: 998 });
        await expect(chatService.sendMessage(1, 5, "hi")).rejects.toThrow("Conversation not found");
    });

    it("trims the message, persists it, touches the conversation, and broadcasts over the socket", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.createMessage.mockResolvedValue(500);

        const result = await chatService.sendMessage(1, 5, "  hello there  ");

        expect(chatRepository.createMessage).toHaveBeenCalledWith(1, 5, "hello there", undefined);
        expect(chatRepository.touchConversation).toHaveBeenCalledWith(1);
        expect(socket.emitNewMessage).toHaveBeenCalledWith(1, expect.objectContaining({
            id: 500, conversation_id: 1, sender_id: 5, message: "hello there"
        }));
        expect(result).toEqual(expect.objectContaining({ id: 500, message: "hello there" }));
    });

    it("still returns the saved message if the socket broadcast throws", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.createMessage.mockResolvedValue(500);
        socket.emitNewMessage.mockImplementation(() => { throw new Error("socket down"); });

        await expect(chatService.sendMessage(1, 5, "hi")).resolves.toEqual(
            expect.objectContaining({ id: 500 })
        );
    });
});

describe("chat.service.markAsRead", () => {
    it("rejects a non-participant", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 999, seller_id: 998 });
        await expect(chatService.markAsRead(1, 5)).rejects.toThrow("Conversation not found");
    });

    it("marks messages read for a participant", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        await chatService.markAsRead(1, 5);
        expect(chatRepository.markMessagesRead).toHaveBeenCalledWith(1, 5);
    });
});

describe("chat.service.deleteMessage", () => {
    it("rejects when the message doesn't exist or belongs to a different conversation", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.findMessageById.mockResolvedValue(undefined);
        await expect(chatService.deleteMessage(1, 900, 5)).rejects.toThrow("Message not found");

        chatRepository.findMessageById.mockResolvedValue({ id: 900, conversation_id: 2, sender_id: 5 });
        await expect(chatService.deleteMessage(1, 900, 5)).rejects.toThrow("Message not found");
    });

    it("rejects deleting someone else's message", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.findMessageById.mockResolvedValue({ id: 900, conversation_id: 1, sender_id: 10 });
        await expect(chatService.deleteMessage(1, 900, 5)).rejects.toThrow("You can only delete your own messages");
    });

    it("is idempotent: a second delete on an already-deleted message returns without re-emitting", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.findMessageById.mockResolvedValue({ id: 900, conversation_id: 1, sender_id: 5, is_deleted: 1 });

        const result = await chatService.deleteMessage(1, 900, 5);

        expect(result).toEqual({ id: 900, already_deleted: true });
        expect(chatRepository.softDeleteMessage).not.toHaveBeenCalled();
        expect(socket.emitMessageDeleted).not.toHaveBeenCalled();
    });

    it("soft-deletes the sender's own message and broadcasts the tombstone", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.findMessageById.mockResolvedValue({ id: 900, conversation_id: 1, sender_id: 5, is_deleted: 0 });

        const result = await chatService.deleteMessage(1, 900, 5);

        expect(chatRepository.softDeleteMessage).toHaveBeenCalledWith(900);
        expect(socket.emitMessageDeleted).toHaveBeenCalledWith(1, { id: 900, conversation_id: 1 });
        expect(result).toEqual({ id: 900, conversation_id: 1 });
    });
});

describe("chat.service.clearConversation", () => {
    it("rejects when there's no cleared-at column for this user (not a participant / bad role)", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.clearedColumnFor.mockReturnValue(null);
        await expect(chatService.clearConversation(1, 5)).rejects.toThrow("Conversation not found");
    });

    it("sets the cleared-at timestamp for the requesting participant only", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.clearedColumnFor.mockReturnValue("buyer_cleared_at");

        await chatService.clearConversation(1, 5);

        expect(chatRepository.setClearedAt).toHaveBeenCalledWith(1, "buyer_cleared_at");
    });
});

describe("chat.service.deleteConversation", () => {
    it("rejects when either column can't be resolved for this user", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.deletedColumnFor.mockReturnValue(null);
        chatRepository.clearedColumnFor.mockReturnValue("buyer_cleared_at");
        await expect(chatService.deleteConversation(1, 5)).rejects.toThrow("Conversation not found");
    });

    it("sets both the deleted-at and cleared-at timestamps for the requesting participant", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.deletedColumnFor.mockReturnValue("buyer_deleted_at");
        chatRepository.clearedColumnFor.mockReturnValue("buyer_cleared_at");

        await chatService.deleteConversation(1, 5);

        expect(chatRepository.setDeletedAt).toHaveBeenCalledWith(1, "buyer_deleted_at");
        expect(chatRepository.setClearedAt).toHaveBeenCalledWith(1, "buyer_cleared_at");
    });
});

describe("chat.service.getMyConversations", () => {
    it("delegates straight to the repository for the given user", async () => {
        chatRepository.findConversationsByUser.mockResolvedValue([{ id: 1 }, { id: 2 }]);

        const result = await chatService.getMyConversations(7);

        expect(chatRepository.findConversationsByUser).toHaveBeenCalledWith(7);
        expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });
});

describe("chat.service.sendAttachment", () => {
    it("rejects when no file was uploaded", async () => {
        await expect(chatService.sendAttachment(1, 5, null, "caption")).rejects.toThrow("No file uploaded");
        expect(uploadToCloudinary).not.toHaveBeenCalled();
    });

    it("uploads an image to Cloudinary and sends it as a message with the resolved attachment fields", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.createMessage.mockResolvedValue(700);
        uploadToCloudinary.mockResolvedValue({ secure_url: "https://cdn.example.com/photo.jpg" });

        const file = { mimetype: "image/png", originalname: "photo.png", size: 2048, buffer: Buffer.from("x") };
        const result = await chatService.sendAttachment(1, 5, file, "check this out");

        expect(uploadToCloudinary).toHaveBeenCalledWith(file.buffer, "nexora/chat", "image");
        expect(chatRepository.createMessage).toHaveBeenCalledWith(
            1,
            5,
            "check this out",
            expect.objectContaining({
                url: "https://cdn.example.com/photo.jpg",
                type: "image",
                name: "photo.png",
                size: 2048
            })
        );
        expect(result).toEqual(expect.objectContaining({ id: 700, attachment_type: "image" }));
    });

    it("routes audio uploads through Cloudinary's video resource type but tags the message attachment as audio", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.createMessage.mockResolvedValue(701);
        uploadToCloudinary.mockResolvedValue({ secure_url: "https://cdn.example.com/voice.mp3" });

        const file = { mimetype: "audio/mpeg", originalname: "voice.mp3", size: 512, buffer: Buffer.from("x") };
        await chatService.sendAttachment(1, 5, file, "");

        expect(uploadToCloudinary).toHaveBeenCalledWith(file.buffer, "nexora/chat", "video");
        expect(chatRepository.createMessage).toHaveBeenCalledWith(
            1, 5, "", expect.objectContaining({ type: "audio" })
        );
    });

    it("falls back to the raw resource type for generic files", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.createMessage.mockResolvedValue(702);
        uploadToCloudinary.mockResolvedValue({ secure_url: "https://cdn.example.com/doc.pdf" });

        const file = { mimetype: "application/pdf", originalname: "doc.pdf", size: 1024, buffer: Buffer.from("x") };
        await chatService.sendAttachment(1, 5, file, "");

        expect(uploadToCloudinary).toHaveBeenCalledWith(file.buffer, "nexora/chat", "raw");
        expect(chatRepository.createMessage).toHaveBeenCalledWith(
            1, 5, "", expect.objectContaining({ type: "file" })
        );
    });
});

describe("chat.service.reactToMessage", () => {
    it("rejects an emoji outside the allowed reaction set", async () => {
        await expect(chatService.reactToMessage(1, 900, 5, "🤡")).rejects.toThrow(
            "That reaction isn't supported"
        );
        expect(chatRepository.addReaction).not.toHaveBeenCalled();
    });

    it("rejects a non-participant", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 999, seller_id: 998 });
        await expect(chatService.reactToMessage(1, 900, 5, "👍")).rejects.toThrow("Conversation not found");
    });

    it("rejects reacting to a message that doesn't exist, belongs to another conversation, or was deleted", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });

        chatRepository.findMessageById.mockResolvedValue(undefined);
        await expect(chatService.reactToMessage(1, 900, 5, "👍")).rejects.toThrow("Message not found");

        chatRepository.findMessageById.mockResolvedValue({ id: 900, conversation_id: 2 });
        await expect(chatService.reactToMessage(1, 900, 5, "👍")).rejects.toThrow("Message not found");

        chatRepository.findMessageById.mockResolvedValue({ id: 900, conversation_id: 1, is_deleted: 1 });
        await expect(chatService.reactToMessage(1, 900, 5, "👍")).rejects.toThrow("Message not found");
    });

    it("adds the reaction, re-fetches the tally, and broadcasts it", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.findMessageById.mockResolvedValue({ id: 900, conversation_id: 1, is_deleted: 0 });
        chatRepository.findReactionsForMessage.mockResolvedValue([{ emoji: "👍", user_id: 5 }]);

        const result = await chatService.reactToMessage(1, 900, 5, "👍");

        expect(chatRepository.addReaction).toHaveBeenCalledWith(900, 5, "👍");
        expect(socket.emitReactionUpdated).toHaveBeenCalledWith(1, {
            conversation_id: 1,
            message_id: 900,
            reactions: [{ emoji: "👍", user_id: 5 }]
        });
        expect(result).toEqual({ conversation_id: 1, message_id: 900, reactions: [{ emoji: "👍", user_id: 5 }] });
    });

    it("still returns the reaction payload if the socket broadcast throws", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.findMessageById.mockResolvedValue({ id: 900, conversation_id: 1, is_deleted: 0 });
        chatRepository.findReactionsForMessage.mockResolvedValue([]);
        socket.emitReactionUpdated.mockImplementation(() => { throw new Error("socket down"); });

        await expect(chatService.reactToMessage(1, 900, 5, "👍")).resolves.toEqual(
            expect.objectContaining({ message_id: 900 })
        );
    });
});

describe("chat.service.removeReaction", () => {
    it("rejects when the message doesn't exist or belongs to a different conversation", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.findMessageById.mockResolvedValue({ id: 900, conversation_id: 2 });

        await expect(chatService.removeReaction(1, 900, 5, "👍")).rejects.toThrow("Message not found");
        expect(chatRepository.removeReaction).not.toHaveBeenCalled();
    });

    it("removes the reaction and broadcasts the updated tally", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 5, seller_id: 10 });
        chatRepository.findMessageById.mockResolvedValue({ id: 900, conversation_id: 1 });
        chatRepository.findReactionsForMessage.mockResolvedValue([]);

        const result = await chatService.removeReaction(1, 900, 5, "👍");

        expect(chatRepository.removeReaction).toHaveBeenCalledWith(900, 5, "👍");
        expect(socket.emitReactionUpdated).toHaveBeenCalledWith(1, {
            conversation_id: 1, message_id: 900, reactions: []
        });
        expect(result).toEqual({ conversation_id: 1, message_id: 900, reactions: [] });
    });
});

describe("chat.service.searchMessages", () => {
    it("returns an empty array without querying the repository when the query is blank", async () => {
        const result = await chatService.searchMessages(1, 5, "   ");
        expect(result).toEqual([]);
        expect(chatRepository.findConversationById).not.toHaveBeenCalled();
        expect(chatRepository.searchMessages).not.toHaveBeenCalled();
    });

    it("rejects a non-participant", async () => {
        chatRepository.findConversationById.mockResolvedValue({ id: 1, buyer_id: 999, seller_id: 998 });
        await expect(chatService.searchMessages(1, 5, "hello")).rejects.toThrow("Conversation not found");
    });

    it("trims the query and searches only messages after the requester's clear-point", async () => {
        chatRepository.findConversationById.mockResolvedValue({
            id: 1, buyer_id: 5, seller_id: 10, buyer_cleared_at: "2026-01-01"
        });
        chatRepository.clearedColumnFor.mockReturnValue("buyer_cleared_at");
        chatRepository.searchMessages.mockResolvedValue([{ id: 5, message: "hello there" }]);

        const result = await chatService.searchMessages(1, 5, "  hello  ");

        expect(chatRepository.searchMessages).toHaveBeenCalledWith(1, "hello", "2026-01-01");
        expect(result).toEqual([{ id: 5, message: "hello there" }]);
    });
});
