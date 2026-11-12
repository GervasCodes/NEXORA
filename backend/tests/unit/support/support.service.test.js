// Support tickets hold people's private messages. Covers who can read/answer a ticket, status changes, and
// the WhatsApp entry point (which used to throw for a customer's FIRST message, see the test named after it).
jest.mock("../../../src/utils/logger", () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    logger.child = () => logger;
    return logger;
});
jest.mock("../../../src/modules/support/support.repository");
jest.mock("../../../src/modules/notification/notification.service");
jest.mock("../../../src/modules/adminNotification/adminNotification.service");

const supportRepository = require("../../../src/modules/support/support.repository");
const notificationService = require("../../../src/modules/notification/notification.service");
const adminNotificationService = require("../../../src/modules/adminNotification/adminNotification.service");
const service = require("../../../src/modules/support/support.service");

const USER = 10;
const ticket = (extra = {}) => ({ id: 3, user_id: USER, status: "open", subject: "Help", ...extra });

beforeEach(() => {
    jest.resetAllMocks();
    supportRepository.create.mockResolvedValue(3);
    supportRepository.findById.mockResolvedValue(ticket());
    supportRepository.findMessages.mockResolvedValue([{ id: 1, body: "hi" }]);
    notificationService.notify.mockResolvedValue(undefined);
    // The real adminNotification.notify is fire-and-forget and returns undefined (it handles its own errors).
    adminNotificationService.notify.mockReturnValue(undefined);
});

describe("support.service.createTicket", () => {
    it("creates the ticket and its first message, tells the admins, and returns the full ticket", async () => {
        const result = await service.createTicket(USER, { subject: "Help", category: "order", message: "Where is my order?" });
        expect(supportRepository.create).toHaveBeenCalledWith({ userId: USER, subject: "Help", category: "order" });
        expect(supportRepository.addMessage).toHaveBeenCalledWith({ ticketId: 3, senderId: USER, senderRole: "user", body: "Where is my order?" });
        expect(adminNotificationService.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "support_ticket", metadata: { ticket_id: 3 } }));
        expect(result.messages).toHaveLength(1);
    });

    it("rejects an unknown category but allows none", async () => {
        await expect(service.createTicket(USER, { subject: "x", category: "bogus", message: "m" })).rejects.toThrow("Invalid ticket category");
        expect(supportRepository.create).not.toHaveBeenCalled();
        await expect(service.createTicket(USER, { subject: "x", message: "m" })).resolves.toBeDefined();
    });
});

describe("support.service.createFromWhatsApp", () => {
    const inbound = { userId: null, contactPhone: "255700000001", body: "Habari, nahitaji msaada" };

    it("a customer's FIRST WhatsApp message creates a ticket and returns it (it used to throw a TypeError after saving)", async () => {
        supportRepository.findOpenByPhone.mockResolvedValue(null);
        const result = await service.createFromWhatsApp(inbound);
        expect(supportRepository.create).toHaveBeenCalledWith(expect.objectContaining({ contactPhone: "255700000001", category: "other" }));
        expect(supportRepository.addMessage).toHaveBeenCalledWith(expect.objectContaining({ body: inbound.body }));
        expect(adminNotificationService.notify).toHaveBeenCalledWith(expect.objectContaining({ title: "New support ticket (WhatsApp)" }));
        expect(result.id).toBe(3);
    });

    it("a later message from the same phone is added to the open ticket instead of creating another", async () => {
        supportRepository.findOpenByPhone.mockResolvedValue({ id: 9 });
        const result = await service.createFromWhatsApp(inbound);
        expect(supportRepository.create).not.toHaveBeenCalled();
        expect(supportRepository.addMessage).toHaveBeenCalledWith(expect.objectContaining({ ticketId: 9 }));
        expect(supportRepository.touch).toHaveBeenCalledWith(9);
        expect(result).toEqual({ id: 9 });
    });
});

describe("support.service: who can see and answer a ticket", () => {
    it("the owner and an admin can read it", async () => {
        await expect(service.getTicket(3, USER, false)).resolves.toMatchObject({ id: 3 });
        await expect(service.getTicket(3, 999, true)).resolves.toMatchObject({ id: 3 });
    });

    it("anyone else gets 'not found' (same answer as a ticket that does not exist)", async () => {
        await expect(service.getTicket(3, 999, false)).rejects.toThrow("Ticket not found");
        supportRepository.findById.mockResolvedValue(null);
        await expect(service.getTicket(3, USER, false)).rejects.toThrow("Ticket not found");
    });

    it("another user cannot reply to someone else's ticket", async () => {
        await expect(service.reply(3, 999, false, "hello")).rejects.toThrow("Ticket not found");
        expect(supportRepository.addMessage).not.toHaveBeenCalled();
    });

    it("an empty reply is refused", async () => {
        await expect(service.reply(3, USER, false, "   ")).rejects.toThrow("A message is required");
        await expect(service.reply(3, USER, false, undefined)).rejects.toThrow("A message is required");
    });

    it("a user's reply is recorded as a user message; no email goes to the user about their own message", async () => {
        await service.reply(3, USER, false, "thanks");
        expect(supportRepository.addMessage).toHaveBeenCalledWith({ ticketId: 3, senderId: USER, senderRole: "user", body: "thanks" });
        expect(notificationService.notify).not.toHaveBeenCalled();
    });

    it("an admin reply is recorded as admin and notifies the ticket owner by email", async () => {
        await service.reply(3, 1, true, "We are checking");
        expect(supportRepository.addMessage).toHaveBeenCalledWith(expect.objectContaining({ senderRole: "admin", senderId: 1 }));
        expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: USER, type: "support_reply", withEmail: true, url: "/support/3" }));
    });

    it("a failed notification does not fail the reply", async () => {
        notificationService.notify.mockRejectedValue(new Error("smtp"));
        await expect(service.reply(3, 1, true, "ok")).resolves.toBeDefined();
    });

    it.each([["resolved"], ["closed"]])("an admin reply to a %s ticket moves it to pending", async (status) => {
        supportRepository.findById.mockResolvedValue(ticket({ status }));
        await service.reply(3, 1, true, "follow-up");
        expect(supportRepository.setStatus).toHaveBeenCalledWith(3, "pending");
    });

    it("a user reply re-opens a resolved ticket but not a closed one", async () => {
        supportRepository.findById.mockResolvedValue(ticket({ status: "resolved" }));
        await service.reply(3, USER, false, "still broken");
        expect(supportRepository.setStatus).toHaveBeenCalledWith(3, "open");
        supportRepository.setStatus.mockClear();
        supportRepository.findById.mockResolvedValue(ticket({ status: "closed" }));
        await service.reply(3, USER, false, "hello?");
        expect(supportRepository.setStatus).not.toHaveBeenCalled();
    });
});

describe("support.service.setStatus", () => {
    it.each(["open", "pending", "resolved", "closed"])("accepts %s", async (status) => {
        await service.setStatus(3, status);
        expect(supportRepository.setStatus).toHaveBeenCalledWith(3, status);
    });

    it("rejects anything else", async () => {
        await expect(service.setStatus(3, "deleted")).rejects.toThrow("Invalid status");
        expect(supportRepository.setStatus).not.toHaveBeenCalled();
    });
});

describe("support routes: who may call what", () => {
    const { buildInventory } = require("../../../scripts/routeInventory");
    const routes = buildInventory().filter((r) => /\/support/.test(r.path));
    it("require a signed-in user, and the admin routes require the admin role", () => {
        expect(routes.length).toBeGreaterThan(3);
        routes.forEach((r) => {
            // The WhatsApp inbound webhook is not under /support, so every support route is session-protected.
            expect(r.guards).toContain("auth");
            if (/\/admin/.test(r.path)) expect(r.guards).toContain("role:admin");
        });
    });
});
