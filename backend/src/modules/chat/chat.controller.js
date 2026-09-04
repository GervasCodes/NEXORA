const chatService = require("./chat.service");

exports.startConversation = async (req, res) => {
    try {
        const { other_user_id, product_id, order_id, role } = req.body;

        if (req.user.role !== "buyer") {
            return res.status(403).json({
                success: false,
                message: "Only buyers can start these conversations"
            });
        }

        if (!["seller", "delivery_agent"].includes(role)) {
            return res.status(400).json({
                success: false,
                message: "role must be 'seller' or 'delivery_agent'"
            });
        }

        const contextId = role === "delivery_agent" ? order_id : product_id;

        const conversation = await chatService.startConversation(
            req.user.id,
            Number(other_user_id),
            role,
            contextId
        );

        return res.status(201).json({
            success: true,
            data: conversation
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getMyConversations = async (req, res) => {
    try {
        const archived = req.query.archived === "true";
        const conversations = await chatService.getMyConversations(req.user.id, { archived });

        return res.json({
            success: true,
            data: conversations
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getUnreadCount = async (req, res) => {
    try {
        const unread = await chatService.getUnreadCount(req.user.id);

        return res.json({
            success: true,
            data: { unread }
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getMessages = async (req, res) => {
    try {
        const messages = await chatService.getMessages(req.params.id, req.user.id);

        return res.json({
            success: true,
            data: messages
        });

    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const saved = await chatService.sendMessage(
            req.params.id,
            req.user.id,
            req.body.message
        );

        return res.status(201).json({
            success: true,
            data: saved
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.sendAttachment = async (req, res) => {
    try {
        const saved = await chatService.sendAttachment(
            req.params.id,
            req.user.id,
            req.file,
            req.body.message
        );

        return res.status(201).json({
            success: true,
            data: saved
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.reactToMessage = async (req, res) => {
    try {
        const result = await chatService.reactToMessage(
            req.params.id,
            req.params.messageId,
            req.user.id,
            req.body.emoji
        );

        return res.status(201).json({
            success: true,
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.removeReaction = async (req, res) => {
    try {
        const result = await chatService.removeReaction(
            req.params.id,
            req.params.messageId,
            req.user.id,
            decodeURIComponent(req.params.emoji)
        );

        return res.json({
            success: true,
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.searchMessages = async (req, res) => {
    try {
        const results = await chatService.searchMessages(req.params.id, req.user.id, req.query.q);

        return res.json({
            success: true,
            data: results
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        await chatService.markAsRead(req.params.id, req.user.id);

        return res.json({
            success: true,
            message: "Messages marked as read"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.deleteMessage = async (req, res) => {
    try {
        const result = await chatService.deleteMessage(req.params.id, req.params.messageId, req.user.id);

        return res.json({
            success: true,
            message: "Message deleted",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.clearConversation = async (req, res) => {
    try {
        await chatService.clearConversation(req.params.id, req.user.id);

        return res.json({
            success: true,
            message: "Conversation cleared"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.deleteConversation = async (req, res) => {
    try {
        await chatService.deleteConversation(req.params.id, req.user.id);

        return res.json({
            success: true,
            message: "Conversation deleted"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Mute / archive (Phase 8, UI/UX remediation).
exports.muteConversation = async (req, res) => {
    try {
        await chatService.muteConversation(req.params.id, req.user.id);
        return res.json({ success: true, message: "Muted." });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.unmuteConversation = async (req, res) => {
    try {
        await chatService.unmuteConversation(req.params.id, req.user.id);
        return res.json({ success: true, message: "Unmuted." });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.archiveConversation = async (req, res) => {
    try {
        await chatService.archiveConversation(req.params.id, req.user.id);
        return res.json({ success: true, message: "Archived." });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.unarchiveConversation = async (req, res) => {
    try {
        await chatService.unarchiveConversation(req.params.id, req.user.id);
        return res.json({ success: true, message: "Unarchived." });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// Cross-conversation search (Phase 8, UI/UX remediation).
exports.searchAllConversations = async (req, res) => {
    try {
        const results = await chatService.searchAllConversations(req.user.id, req.query.q);
        return res.json({ success: true, data: results });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
