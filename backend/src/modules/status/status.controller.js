const statusService = require("./status.service");

exports.getPublicStatus = async (req, res) => {
    try {
        const data = await statusService.getPublicStatus();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
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
