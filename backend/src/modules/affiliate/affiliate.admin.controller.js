const affiliateService = require("./affiliate.service");

exports.listAccounts = async (req, res) => {
    try {
        const data = await affiliateService.listAccounts(req.query.status);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.approve = async (req, res) => {
    try {
        const data = await affiliateService.approve(req.params.userId);
        return res.json({ success: true, message: "Affiliate approved", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.reject = async (req, res) => {
    try {
        const data = await affiliateService.reject(req.params.userId);
        return res.json({ success: true, message: "Affiliate rejected", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listConversions = async (req, res) => {
    try {
        const data = await affiliateService.listConversions();
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listPayouts = async (req, res) => {
    try {
        const data = await affiliateService.listPayouts(req.query.status);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.markPayoutPaid = async (req, res) => {
    try {
        const data = await affiliateService.markPayoutPaid(req.params.id, { reference: req.body.reference });
        return res.json({ success: true, message: "Payout marked paid", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.rejectPayout = async (req, res) => {
    try {
        const data = await affiliateService.rejectPayout(req.params.id, { note: req.body.note });
        return res.json({ success: true, message: "Payout rejected and returned to wallet", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
