const affiliateService = require("./affiliate.service");

exports.apply = async (req, res) => {
    try {
        const data = await affiliateService.apply(req.user.id);
        return res.json({ success: true, message: "Affiliate account ready", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getDashboard = async (req, res) => {
    try {
        const data = await affiliateService.getDashboard(req.user.id);
        if (!data) return res.status(404).json({ success: false, message: "You're not an affiliate yet" });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.trackClick = async (req, res) => {
    try {
        const clickToken = await affiliateService.trackClick(req.body.code, req.body.path);
        return res.json({ success: true, data: { clickToken } });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
