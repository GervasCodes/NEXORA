const liveSellingService = require("./liveSelling.service");

exports.create = async (req, res) => {
    try {
        const data = await liveSellingService.create(req.user.id, req.body);
        return res.status(201).json({ success: true, message: "Session scheduled", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listUpcoming = async (req, res) => {
    try {
        const data = await liveSellingService.listUpcoming();
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listMine = async (req, res) => {
    try {
        const data = await liveSellingService.listBySeller(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.setStatus = async (req, res) => {
    try {
        const data = await liveSellingService.setStatus(req.params.id, req.user.id, req.body.status);
        return res.json({ success: true, message: "Status updated", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
