const adminNotificationRepository = require("./adminNotification.repository");
const pushService = require("../push/push.service");

// Fire-and-forget by design, same pattern as audit.service.js#log and
// fraud.service.js's evaluateOrder/evaluateWithdrawal: raising an admin
// notification must never delay or fail the action that triggered it
// (a registration, a suspension, a dispute being filed). If the insert
// itself fails, it's logged to the console and swallowed rather than
// surfaced to the end user or the acting admin.
//
// `category` groups the event for the admin notification center's
// filters: 'account' (registration, suspension, deletion),
// 'moderation' (reports/tickets/abuse - currently just disputes, the
// only reporting mechanism NEXORA has today), or 'security' (fraud
// flags and other system/security events).
exports.notify = ({ type, category, severity, title, message, metadata, relatedUserId }) => {
    adminNotificationRepository
        .create({ type, category, severity, title, message, metadata, relatedUserId })
        .then((id) => {
            // Real-time fan-out to every connected admin (the shared "admins"
            // socket room every admin/super_admin auto-joins - see socket.js)
            // plus web push for admins who've installed the PWA and aren't
            // currently looking at a tab. Same lazy-require reasoning as
            // notification.service.js: socket.js requires chat.service.js
            // at load time, so a top-level require here risks a partially
            // loaded module during circular resolution.
            try {
                const socket = require("../../socket/socket");
                socket.emitToAdmins("admin_notification:new", {
                    id,
                    type,
                    category,
                    severity: severity || "info",
                    title,
                    message,
                    related_user_id: relatedUserId || null,
                    is_read: false,
                    created_at: new Date()
                });
            } catch (error) {
                // Socket layer being unavailable should never break admin notification creation
            }

            pushService
                .sendToAdmins({ title, body: message, type, category, severity: severity || "info" })
                .catch((err) => console.error("Push send error (adminNotify):", err.message));
        })
        .catch((err) => {
            console.error(`[adminNotification] failed to record "${type}":`, err.message);
        });
};

exports.getRecent = async ({ category, unreadOnly, limit } = {}) => {
    return adminNotificationRepository.findRecent({ category, unreadOnly, limit });
};

exports.getUnreadCount = async () => {
    return adminNotificationRepository.countUnread();
};

exports.markAsRead = async (id, adminId) => {
    const notification = await adminNotificationRepository.findById(id);

    if (!notification) {
        throw Object.assign(new Error("Notification not found"), { status: 404 });
    }

    await adminNotificationRepository.markAsRead(id, adminId);
};

exports.markAllAsRead = async (adminId) => {
    await adminNotificationRepository.markAllAsRead(adminId);
};
