const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const adminNotificationController = require("./adminNotification.controller");
const { notificationIdValidation } = require("./adminNotification.validator");

// Any admin (regular or super_admin) can view and acknowledge the shared
// notification feed - reading it isn't a permission-gated action the way
// creating/removing other admins is (requireSuperAdmin).
router.use(authMiddleware, authorize("admin"));

router.get("/", adminNotificationController.list);
router.get("/unread-count", adminNotificationController.getUnreadCount);

router.put("/read-all", adminNotificationController.markAllAsRead);
router.put(
    "/:id/read",
    notificationIdValidation,
    validationMiddleware,
    adminNotificationController.markAsRead
);

module.exports = router;
