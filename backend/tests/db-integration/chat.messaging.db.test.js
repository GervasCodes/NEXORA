// Exercises chat.service against a real MySQL instance. tests/unit/chat
// already covers this service's logic against a mocked repository; this
// file exists to catch what a mock can't - a broken JOIN, a typo'd
// column, or (as this suite already once needed - see chat.service.test
// .js's history) a fixture that silently papers over what the real
// repository actually returns.
const db = require("../../src/config/db");
const chatService = require("../../src/modules/chat/chat.service");
const fixtures = require("./helpers/dbFixtures");

beforeEach(async () => {
    await fixtures.resetTables();
});

afterAll(async () => {
    await fixtures.closePool();
});

describe("chat.service messaging (real DB)", () => {
    it("sendMessage persists the message, touches the conversation, and eventually notifies the other participant", async () => {
        const buyer = await fixtures.createUser();
        const seller = await fixtures.createUser({ role: "seller" });
        const conversation = await fixtures.createConversation(buyer.id, seller.id);

        const saved = await chatService.sendMessage(conversation.id, buyer.id, "  Is this still available?  ");

        expect(saved.message).toBe("Is this still available?");

        const [[messageRow]] = await db.query(
            "SELECT sender_id, message FROM messages WHERE id = ?", [saved.id]
        );
        expect(messageRow.sender_id).toBe(buyer.id);
        expect(messageRow.message).toBe("Is this still available?");

        const notificationRows = await fixtures.waitForRows(
            "SELECT user_id, type FROM notifications WHERE user_id = ? AND type = 'message'",
            [seller.id]
        );
        expect(notificationRows).toHaveLength(1);
    });

    it("rejects a non-participant trying to send a message", async () => {
        const buyer = await fixtures.createUser();
        const seller = await fixtures.createUser({ role: "seller" });
        const stranger = await fixtures.createUser();
        const conversation = await fixtures.createConversation(buyer.id, seller.id);

        await expect(chatService.sendMessage(conversation.id, stranger.id, "hi")).rejects.toThrow(
            "Conversation not found"
        );
    });

    it("reactToMessage/removeReaction round-trip through the real reaction table and tally correctly", async () => {
        const buyer = await fixtures.createUser();
        const seller = await fixtures.createUser({ role: "seller" });
        const conversation = await fixtures.createConversation(buyer.id, seller.id);
        const message = await fixtures.createMessage(conversation.id, buyer.id);

        const afterAdd = await chatService.reactToMessage(conversation.id, message.id, seller.id, "👍");
        expect(afterAdd.reactions).toEqual([
            { emoji: "👍", user_id: seller.id }
        ]);

        const afterRemove = await chatService.removeReaction(conversation.id, message.id, seller.id, "👍");
        expect(afterRemove.reactions).toEqual([]);
    });

    it("searchMessages only returns matches after the requester's own clear-point", async () => {
        const buyer = await fixtures.createUser();
        const seller = await fixtures.createUser({ role: "seller" });
        const conversation = await fixtures.createConversation(buyer.id, seller.id);

        await fixtures.createMessage(conversation.id, buyer.id, { message: "old message about pricing" });
        await db.query("UPDATE conversations SET buyer_cleared_at = NOW() WHERE id = ?", [conversation.id]);
        // Ensure the "new" message's created_at is strictly after the
        // clear-point despite TIMESTAMP's 1-second resolution.
        await new Promise((resolve) => setTimeout(resolve, 1100));
        await fixtures.createMessage(conversation.id, seller.id, { message: "new message about pricing" });

        const results = await chatService.searchMessages(conversation.id, buyer.id, "pricing");

        expect(results).toHaveLength(1);
        expect(results[0].message).toBe("new message about pricing");
    });

    it("deleteMessage tombstones the message (sender only) instead of hard-deleting the row", async () => {
        const buyer = await fixtures.createUser();
        const seller = await fixtures.createUser({ role: "seller" });
        const conversation = await fixtures.createConversation(buyer.id, seller.id);
        const message = await fixtures.createMessage(conversation.id, buyer.id, { message: "oops, wrong chat" });

        await expect(chatService.deleteMessage(conversation.id, message.id, seller.id)).rejects.toThrow();

        await chatService.deleteMessage(conversation.id, message.id, buyer.id);

        const [[row]] = await db.query(
            "SELECT is_deleted, deleted_at FROM messages WHERE id = ?", [message.id]
        );
        expect(row.is_deleted).toBe(1);
        expect(row.deleted_at).not.toBeNull();
    });

    it("clearConversation only hides history for the participant who cleared it, not the other side", async () => {
        const buyer = await fixtures.createUser();
        const seller = await fixtures.createUser({ role: "seller" });
        const conversation = await fixtures.createConversation(buyer.id, seller.id);
        await fixtures.createMessage(conversation.id, buyer.id, { message: "hello" });

        await chatService.clearConversation(conversation.id, buyer.id);

        const buyerMessages = await chatService.getMessages(conversation.id, buyer.id);
        expect(buyerMessages).toHaveLength(0);

        const sellerMessages = await chatService.getMessages(conversation.id, seller.id);
        expect(sellerMessages).toHaveLength(1);
    });
});
