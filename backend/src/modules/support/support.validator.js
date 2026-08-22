const { body, param } = require("express-validator");

const CATEGORIES = ["order", "payment", "account", "product", "other"];

exports.createTicketValidation = [
    body("subject")
        .notEmpty()
        .isLength({ max: 200 })
        .withMessage("Subject is required (max 200 characters)"),
    body("category")
        .optional()
        .isIn(CATEGORIES)
        .withMessage("Invalid category"),
    body("message")
        .notEmpty()
        .withMessage("A message is required")
];

exports.ticketIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid ticket")
];

exports.replyValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid ticket"),
    body("body").notEmpty().withMessage("A message is required")
];

exports.setStatusValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid ticket"),
    body("status").isIn(["open", "pending", "resolved", "closed"]).withMessage("Invalid status")
];
