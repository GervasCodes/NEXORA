jest.mock("../../../src/modules/chat/chat.repository");
jest.mock("../../../src/socket/socket");

const chatRepository = require("../../../src/modules/chat/chat.repository");
const socket = require("../../../src/socket/socket");

const chatService = require("../../../src/modules/chat/chat.service");

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
        expect(result).toEqual([{ id: 1 }]);
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

        expect(chatRepository.createMessage).toHaveBeenCalledWith(1, 5, "hello there");
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
