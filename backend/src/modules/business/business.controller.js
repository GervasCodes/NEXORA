const businessService = require("./business.service");

exports.getMyStatus = async (req, res) => {
    try {
        const data = await businessService.getMyStatus(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.apply = async (req, res) => {
    try {
        const data = await businessService.apply(req.user.id, req.body);
        return res.json({ success: true, message: "Business account application submitted", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listPending = async (req, res) => {
    try {
        const data = await businessService.listPending();
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.verify = async (req, res) => {
    try {
        const data = await businessService.verify(req.params.userId, Boolean(req.body.approved));
        return res.json({ success: true, message: "Business account status updated", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getTiers = async (req, res) => {
    try {
        const data = await businessService.getTiers(req.params.productId);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.setTiers = async (req, res) => {
    try {
        const data = await businessService.setTiers(req.user.id, req.params.productId, req.body.tiers);
        return res.json({ success: true, message: "Bulk pricing updated", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
