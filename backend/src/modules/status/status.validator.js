const { body } = require("express-validator");

exports.subscribeValidation = [
    body("email").trim().isEmail().isLength({ max: 255 }).withMessage("A valid email is required")
];

exports.createIncidentValidation = [
    body("title").trim().notEmpty().isLength({ max: 150 }).withMessage("A title is required"),
    body("message").trim().notEmpty().withMessage("A message is required"),
    body("component").optional().isIn(["platform", "payments", "orders", "bookings", "delivery", "notifications"]),
    body("severity").optional().isIn(["minor", "major", "critical"]),
    body("status").optional().isIn(["investigating", "identified", "monitoring", "resolved"])
];

exports.updateIncidentValidation = [
    body("title").optional().trim().isLength({ max: 150 }),
    body("component").optional().isIn(["platform", "payments", "orders", "bookings", "delivery", "notifications"]),
    body("severity").optional().isIn(["minor", "major", "critical"]),
    body("status").optional().isIn(["investigating", "identified", "monitoring", "resolved"])
];
