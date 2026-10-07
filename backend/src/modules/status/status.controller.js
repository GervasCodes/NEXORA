const statusService = require("./status.service");

exports.getPublicStatus = async (req, res) => {
    try {
        const data = await statusService.getPublicStatus();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Always answers the same way, so the form can't be used to find out
// which addresses are already subscribed.
exports.subscribe = async (req, res) => {
    try {
        await statusService.subscribe(req.body.email);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: "Couldn't subscribe right now. Try again later." });
    }
};

exports.unsubscribe = async (req, res) => {
    try {
        const removed = await statusService.unsubscribe(String(req.body.token || ""));
        res.json({ success: true, data: { removed } });
    } catch (error) {
        res.status(500).json({ success: false, message: "Couldn't unsubscribe right now. Try again later." });
    }
};

exports.listForAdmin = async (req, res) => {
    try {
        const data = await statusService.listRecent();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createIncident = async (req, res) => {
    try {
        const id = await statusService.createIncident(req.body, req.user.id);
        res.status(201).json({ success: true, data: { id } });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateIncident = async (req, res) => {
    try {
        await statusService.updateIncident(req.params.id, req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
