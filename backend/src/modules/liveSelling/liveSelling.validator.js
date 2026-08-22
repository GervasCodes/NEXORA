const { body, param } = require("express-validator");

exports.createValidation = [
    body("title").notEmpty().isLength({ max: 200 }).withMessage("Title is required"),
    body("description").optional({ nullable: true }).isLength({ max: 1000 }),
    body("externalLink").isURL().withMessage("A valid link is required"),
    body("scheduledAt").isISO8601().withMessage("Invalid scheduled time")
];

exports.setStatusValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid session"),
    body("status").isIn(["live", "ended", "cancelled"]).withMessage("Invalid status")
];
