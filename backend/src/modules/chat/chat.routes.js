const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const chatController = require("./chat.controller");
const {
    startConversationValidation,
    conversationIdValidation,
    messageIdValidation,
    sendMessageValidation
} = require("./chat.validator");

router.use(authMiddleware);

router.post(
    "/conversations",
    startConversationValidation,
    validationMiddleware,
    chatController.startConversation
);

router.get("/conversations", chatController.getMyConversations);

router.get(
    "/conversations/:id/messages",
    conversationIdValidation,
    validationMiddleware,
    chatController.getMessages
);

router.post(
    "/conversations/:id/messages",
    sendMessageValidation,
    validationMiddleware,
    chatController.sendMessage
);

router.put(
    "/conversations/:id/read",
    conversationIdValidation,
    validationMiddleware,
    chatController.markAsRead
);

router.delete(
    "/conversations/:id/messages/:messageId",
    messageIdValidation,
    validationMiddleware,
    chatController.deleteMessage
);

router.post(
    "/conversations/:id/clear",
    conversationIdValidation,
    validationMiddleware,
    chatController.clearConversation
);

module.exports = router;
