const pushService = require("./push.service");

exports.getPublicKey = (req, res) => {
    const publicKey = pushService.getPublicKey();

    if (!publicKey) {
        return res.status(503).json({
            success: false,
            message: "Push notifications aren't configured on this server yet"
        });
    }

    return res.json({ success: true, data: { publicKey } });
};

exports.subscribe = async (req, res) => {
    try {
        await pushService.subscribe(req.user.id, req.body.subscription);
        return res.status(201).json({ success: true, message: "Subscribed to push notifications" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.unsubscribe = async (req, res) => {
    try {
        await pushService.unsubscribe(req.user.id, req.body.endpoint);
        return res.json({ success: true, message: "Unsubscribed" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
