const broadcastService = require("./broadcast.service");

exports.preview = async (req, res) => {
    try {
        const result = await broadcastService.previewAudience(req.body.segment);
        return res.json({ success: true, data: result });
    } catch (error) {
        return res.status(error.status || 400).json({ success: false, message: error.message });
    }
};

exports.send = async (req, res) => {
    try {
        const result = await broadcastService.sendBroadcast({
            adminId: req.user.id,
            segment: req.body.segment,
            channels: req.body.channels,
            subject: req.body.subject,
            message: req.body.message,
            smsMessage: req.body.smsMessage,
            whatsappMessage: req.body.whatsappMessage,
            inAppTitle: req.body.inAppTitle,
            inAppMessage: req.body.inAppMessage
        });
        return res.json({ success: true, data: result });
    } catch (error) {
        return res.status(error.status || 400).json({ success: false, message: error.message });
    }
};

exports.getHistory = async (req, res) => {
    try {
        const data = await broadcastService.getHistory();
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.remove = async (req, res) => {
    try {
        await broadcastService.deleteBroadcast(req.params.id);
        return res.json({ success: true });
    } catch (error) {
        return res.status(error.status || 400).json({ success: false, message: error.message });
    }
};

exports.resend = async (req, res) => {
    try {
        const result = await broadcastService.resendBroadcast(req.params.id, req.user.id);
        return res.json({ success: true, data: result });
    } catch (error) {
        return res.status(error.status || 400).json({ success: false, message: error.message });
    }
};
