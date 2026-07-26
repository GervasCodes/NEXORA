const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const uploadChatAttachment = require("../../middleware/uploadChatAttachment.middleware");

const chatController = require("./chat.controller");
const {
    startConversationValidation,
    conversationIdValidation,
    messageIdValidation,
    sendMessageValidation,
    sendAttachmentValidation,
    reactionValidation,
    removeReactionValidation,
    searchValidation
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

router.post(
    "/conversations/:id/attachments",
    uploadChatAttachment.single("file"),
    sendAttachmentValidation,
    validationMiddleware,
    chatController.sendAttachment
);

// Kept above the "/:id" delete route below so express doesn't need to
// disambiguate - both are literal-suffix segments off the same :id param,
// same pattern as review.routes.js's /product vs /store split.
router.get(
    "/conversations/:id/search",
    searchValidation,
    validationMiddleware,
    chatController.searchMessages
);

router.post(
    "/conversations/:id/messages/:messageId/reactions",
    reactionValidation,
    validationMiddleware,
    chatController.reactToMessage
);

router.delete(
    "/conversations/:id/messages/:messageId/reactions/:emoji",
    removeReactionValidation,
    validationMiddleware,
    chatController.removeReaction
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

router.delete(
    "/conversations/:id",
    conversationIdValidation,
    validationMiddleware,
    chatController.deleteConversation
);

module.exports = router;
