const { param } = require("express-validator");

// Accepts either a plain personal-notification id ("42") or a merged-in
// shared admin-notification id ("admin:42") - see notification.service.js's
// ADMIN_ID_PREFIX. isInt() alone would reject every shared-feed item an
// admin's bell now shows.
exports.notificationIdValidation = [
    param("id")
        .matches(/^(admin:)?[1-9]\d*$/).withMessage("Invalid notification")
];
