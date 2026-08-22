/**
 * In-app support/helpdesk widget (Phase Q3) - deliberately separate
 * from the `chat` module (buyer<->seller/delivery-agent messaging,
 * which has no admin participant at all). Any authenticated user
 * (buyer, seller, or delivery agent) can open a ticket; only admins
 * work the queue.
 */

const supportRepository = require("./support.repository");
const notificationService = require("../notification/notification.service");
const adminNotificationService = require("../adminNotification/adminNotification.service");
const logger = require("../../utils/logger").child({ module: "support" });

const CATEGORIES = ["order", "payment", "account", "product", "other"];

exports.createTicket = async (userId, { subject, category, message }) => {
    if (category && !CATEGORIES.includes(category)) {
        throw new Error("Invalid ticket category");
    }

    const ticketId = await supportRepository.create({ userId, subject, category });
    await supportRepository.addMessage({ ticketId, senderId: userId, senderRole: "user", body: message });

    adminNotificationService.notify({
        type: "support_ticket",
        category: "moderation",
        severity: "info",
        title: "New support ticket",
        message: subject,
        metadata: { ticket_id: ticketId },
        relatedUserId: userId
    });

    return getFullTicket(ticketId);
};

// Called from whatsapp.service.js when a buyer taps "3 - talk to
// support" - reuses an existing open ticket for that phone number
// rather than opening a new one on every message, since a WhatsApp
// conversation naturally repeats "3" if the bot's reply didn't fully
// answer them.
exports.createFromWhatsApp = async ({ userId, contactPhone, body }) => {
    const existing = await supportRepository.findOpenByPhone(contactPhone);
    if (existing) {
        await supportRepository.addMessage({ ticketId: existing.id, senderId: userId, senderRole: "user", body });
        await supportRepository.touch(existing.id);
        return existing;
    }

    const ticketId = await supportRepository.create({
        userId,
        contactPhone,
        subject: "WhatsApp support request",
        category: "other"
    });
    await supportRepository.addMessage({ ticketId, senderId: userId, senderRole: "user", body });

    adminNotificationService.notifyAdmins({
        type: "support_ticket",
        title: "New support ticket (WhatsApp)",
        message: body,
        url: `/admin/support/${ticketId}`
    }).catch((err) => logger.warn({ err, ticketId }, "admin notify error (whatsapp ticket)"));

    return getFullTicket(ticketId);
};

const assertParticipant = (ticket, userId, isAdmin) => {
    if (!ticket) throw new Error("Ticket not found");
    if (!isAdmin && ticket.user_id !== userId) throw new Error("Ticket not found");
};

const getFullTicket = async (ticketId) => {
    const ticket = await supportRepository.findById(ticketId);
    if (!ticket) return null;
    const messages = await supportRepository.findMessages(ticketId);
    return { ...ticket, messages };
};

exports.getMyTickets = async (userId) => supportRepository.findByUser(userId);

exports.getTicket = async (ticketId, userId, isAdmin) => {
    const ticket = await supportRepository.findById(ticketId);
    assertParticipant(ticket, userId, isAdmin);
    return getFullTicket(ticketId);
};

exports.reply = async (ticketId, userId, isAdmin, body) => {
    const ticket = await supportRepository.findById(ticketId);
    assertParticipant(ticket, userId, isAdmin);

    if (!body || !body.trim()) {
        throw new Error("A message is required");
    }

    await supportRepository.addMessage({
        ticketId,
        senderId: userId,
        senderRole: isAdmin ? "admin" : "user",
        body
    });
    await supportRepository.touch(ticketId);

    // Admin replying re-opens a resolved/closed ticket back to
    // "pending" (waiting on the user); a user replying to an
    // admin-answered ticket does the same in reverse - either way the
    // ticket should never sit "resolved" with an unread reply on it.
    if (isAdmin && ["resolved", "closed"].includes(ticket.status)) {
        await supportRepository.setStatus(ticketId, "pending");
    } else if (!isAdmin && ticket.status === "resolved") {
        await supportRepository.setStatus(ticketId, "open");
    }

    if (isAdmin && ticket.user_id) {
        notificationService.notify({
            userId: ticket.user_id,
            type: "support_reply",
            titleKey: "notifications.support.reply.title",
            messageKey: "notifications.support.reply.message",
            url: `/support/${ticketId}`,
            withEmail: true
        }).catch((err) => logger.warn({ err, ticketId }, "support reply notify error"));
    }

    return getFullTicket(ticketId);
};

exports.listAll = async (filter) => supportRepository.findAll(filter);

exports.setStatus = async (ticketId, status) => {
    if (!["open", "pending", "resolved", "closed"].includes(status)) {
        throw new Error("Invalid status");
    }
    await supportRepository.setStatus(ticketId, status);
    return getFullTicket(ticketId);
};

exports.CATEGORIES = CATEGORIES;
