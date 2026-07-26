const { param } = require("express-validator");

exports.notificationIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid notification")
];
