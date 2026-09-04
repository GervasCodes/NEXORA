const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const uploadChatAttachment = require("../../middleware/uploadChatAttachment.middleware");
const maintenanceCheck = require("../../middleware/maintenance.middleware");

const chatController = require("./chat.controller");
const {
    startConversationValidation,
    conversationIdValidation,
    messageIdValidation,
    sendMessageValidation,
    sendAttachmentValidation,
    reactionValidation,
    removeReactionValidation,
    searchValidation,
    searchAllValidation
} = require("./chat.validator");

router.use(authMiddleware);
// Only gates the REST endpoints here (starting/fetching conversations,
// sending messages/attachments, reactions, search) - the realtime socket
// layer in socket/ is separate and isn't touched by this toggle.
router.use(maintenanceCheck("chat"));

router.post(
    "/conversations",
    startConversationValidation,
    validationMiddleware,
    chatController.startConversation
);

router.get("/conversations", chatController.getMyConversations);

// Phase 8 (UI/UX remediation) - cross-conversation search. Placed here
// (a literal "search" suffix, not a param) so there's no ambiguity with
// any /conversations/:id/... route below - same reasoning the existing
// comment above /conversations/:id/search already gives for that one.
router.get("/conversations/search", searchAllValidation, validationMiddleware, chatController.searchAllConversations);

router.get("/unread-count", chatController.getUnreadCount);

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

// Mute / archive (Phase 8, UI/UX remediation).
router.put(
    "/conversations/:id/mute",
    conversationIdValidation,
    validationMiddleware,
    chatController.muteConversation
);

router.delete(
    "/conversations/:id/mute",
    conversationIdValidation,
    validationMiddleware,
    chatController.unmuteConversation
);

router.put(
    "/conversations/:id/archive",
    conversationIdValidation,
    validationMiddleware,
    chatController.archiveConversation
);

router.delete(
    "/conversations/:id/archive",
    conversationIdValidation,
    validationMiddleware,
    chatController.unarchiveConversation
);

router.delete(
    "/conversations/:id",
    conversationIdValidation,
    validationMiddleware,
    chatController.deleteConversation
);

module.exports = router;
