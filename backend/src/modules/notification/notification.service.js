const notificationRepository = require("./notification.repository");
const sendEmail = require("../../utils/sendEmail");

// Reusable helper: other modules (order, payment, delivery) call this
// directly to raise a notification. Creates the in-app record always,
// and best-effort emails the user when withEmail is true.
exports.notify = async ({ userId, type, title, message, relatedOrderId, withEmail }) => {
    await notificationRepository.create(userId, type, title, message, relatedOrderId);

    if (withEmail) {
        const email = await notificationRepository.getUserEmail(userId);
        if (email) {
            await sendEmail(email, title, message);
        }
    }
};

exports.getMyNotifications = async (userId) => {
    return notificationRepository.findByUser(userId);
};

exports.getUnreadCount = async (userId) => {
    return notificationRepository.countUnread(userId);
};

exports.markAsRead = async (notificationId, userId) => {
    const notification = await notificationRepository.findById(notificationId);

    if (!notification || notification.user_id !== userId) {
        throw new Error("Notification not found");
    }

    await notificationRepository.markAsRead(notificationId);
};

exports.markAllAsRead = async (userId) => {
    await notificationRepository.markAllAsRead(userId);
};

exports.deleteNotification = async (notificationId, userId) => {
    const notification = await notificationRepository.findById(notificationId);

    if (!notification || notification.user_id !== userId) {
        throw new Error("Notification not found");
    }

    await notificationRepository.remove(notificationId);
};
