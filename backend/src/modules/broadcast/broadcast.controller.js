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
            message: req.body.message
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
