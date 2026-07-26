const adminNotificationService = require("./adminNotification.service");

exports.list = async (req, res) => {
    try {
        const { category, unread_only, limit } = req.query;

        const notifications = await adminNotificationService.getRecent({
            category,
            unreadOnly: unread_only === "true",
            limit: limit ? Number(limit) : undefined
        });

        return res.json({ success: true, data: notifications });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getUnreadCount = async (req, res) => {
    try {
        const count = await adminNotificationService.getUnreadCount();

        return res.json({ success: true, data: { unread: count } });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        await adminNotificationService.markAsRead(req.params.id, req.user.id);

        return res.json({ success: true, message: "Notification marked as read" });

    } catch (error) {
        return res.status(error.status || 400).json({ success: false, message: error.message });
    }
};

exports.markAllAsRead = async (req, res) => {
    try {
        await adminNotificationService.markAllAsRead(req.user.id);

        return res.json({ success: true, message: "All notifications marked as read" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
