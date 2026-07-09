const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const notificationController = require("./notification.controller");
const { notificationIdValidation } = require("./notification.validator");

router.get("/", authMiddleware, notificationController.getMyNotifications);

router.get("/unread-count", authMiddleware, notificationController.getUnreadCount);

router.put(
    "/read-all",
    authMiddleware,
    notificationController.markAllAsRead
);

router.put(
    "/:id/read",
    authMiddleware,
    notificationIdValidation,
    validationMiddleware,
    notificationController.markAsRead
);

router.delete(
    "/:id",
    authMiddleware,
    notificationIdValidation,
    validationMiddleware,
    notificationController.deleteNotification
);

module.exports = router;
