const { body, param } = require("express-validator");

exports.startConversationValidation = [
    body("other_user_id")
        .notEmpty()
        .withMessage("other_user_id is required")
        .isInt({ gt: 0 })
        .withMessage("Invalid user"),

    body("role")
        .isIn(["seller", "delivery_agent"])
        .withMessage("role must be 'seller' or 'delivery_agent'"),

    body("product_id")
        .optional()
        .isInt({ gt: 0 })
        .withMessage("Invalid product"),

    body("order_id")
        .optional()
        .isInt({ gt: 0 })
        .withMessage("Invalid order")
];

exports.conversationIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid conversation")
];

exports.messageIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid conversation"),
    param("messageId").isInt({ gt: 0 }).withMessage("Invalid message")
];

exports.sendMessageValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid conversation"),

    body("message")
        .notEmpty()
        .withMessage("Message cannot be empty")
        .isLength({ max: 2000 })
        .withMessage("Message is too long")
];
