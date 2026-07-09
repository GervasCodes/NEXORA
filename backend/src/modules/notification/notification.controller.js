const notificationService = require("./notification.service");

exports.getMyNotifications = async (req, res) => {
    try {
        const notifications = await notificationService.getMyNotifications(req.user.id);

        return res.json({
            success: true,
            data: notifications
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getUnreadCount = async (req, res) => {
    try {
        const count = await notificationService.getUnreadCount(req.user.id);

        return res.json({
            success: true,
            data: { unread: count }
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        await notificationService.markAsRead(req.params.id, req.user.id);

        return res.json({
            success: true,
            message: "Notification marked as read"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.markAllAsRead = async (req, res) => {
    try {
        await notificationService.markAllAsRead(req.user.id);

        return res.json({
            success: true,
            message: "All notifications marked as read"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.deleteNotification = async (req, res) => {
    try {
        await notificationService.deleteNotification(req.params.id, req.user.id);

        return res.json({
            success: true,
            message: "Notification deleted"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
