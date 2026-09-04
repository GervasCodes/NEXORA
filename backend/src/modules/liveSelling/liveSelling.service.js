/**
 * Live-selling sessions (Phase Q7) - a scheduling/announcement layer,
 * not real video streaming infrastructure. See migration 089's header
 * comment for the explicit scope reasoning.
 */

const liveSellingRepository = require("./liveSelling.repository");
const notificationService = require("../notification/notification.service");

exports.create = async (sellerId, { title, description, externalLink, scheduledAt }) => {
    if (!title || !externalLink || !scheduledAt) {
        throw new Error("Title, link, and scheduled time are required");
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
        throw new Error("Scheduled time must be in the future");
    }

    const id = await liveSellingRepository.create(sellerId, { title, description, externalLink, scheduledAt });
    return liveSellingRepository.findById(id);
};

exports.listUpcoming = async () => liveSellingRepository.findUpcoming();

exports.listBySeller = async (sellerId) => liveSellingRepository.findBySeller(sellerId);

exports.setStatus = async (id, sellerId, status) => {
    if (!["live", "ended", "cancelled"].includes(status)) {
        throw new Error("Invalid status");
    }
    const session = await liveSellingRepository.findById(id);
    if (!session || session.seller_id !== sellerId) {
        throw new Error("Session not found");
    }
    await liveSellingRepository.setStatus(id, status);
    const updated = await liveSellingRepository.findById(id);

    // Reminders (Phase 9, UI/UX remediation) - fire-and-forget, same
    // reasoning as every other "notify someone" call elsewhere in this
    // codebase. Only fires on the transition into 'live', not on every
    // status change (an 'ended'/'cancelled' session isn't something a
    // "notify me when it starts" subscriber needs to hear about again).
    if (status === "live") {
        exports.notifyReminders(id, updated).catch(() => {});
    }

    return updated;
};

exports.subscribeReminder = async (userId, sessionId) => {
    const session = await liveSellingRepository.findById(sessionId);
    if (!session) {
        throw new Error("Session not found");
    }
    if (session.status !== "scheduled") {
        throw new Error("This session is no longer scheduled");
    }
    await liveSellingRepository.subscribeReminder(userId, sessionId);
};

exports.unsubscribeReminder = async (userId, sessionId) => {
    await liveSellingRepository.unsubscribeReminder(userId, sessionId);
};

exports.getReminderStatus = async (userId, sessionId) => ({
    subscribed: await liveSellingRepository.isReminderSubscribed(userId, sessionId)
});

exports.notifyReminders = async (sessionId, session) => {
    const pending = await liveSellingRepository.findPendingReminders(sessionId);
    if (!pending.length) return;

    await Promise.all(pending.map((sub) =>
        notificationService.notify({
            userId: sub.user_id,
            type: "live_selling_started",
            title: "Going live now",
            message: `"${session.title}" by ${session.store_name} just went live.`,
            url: "/live-selling"
        }).catch(() => {})
    ));

    await liveSellingRepository.markRemindersNotified(pending.map((sub) => sub.id));
};
