const kycService = require("./kyc.service");

exports.getMyStatus = async (req, res) => {
    try {
        const data = await kycService.getMyStatus(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.requestUpgrade = async (req, res) => {
    try {
        const data = await kycService.requestUpgrade(req.user.id, req.body, req.file);
        return res.status(201).json({ success: true, message: "Upgrade request submitted", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listRequests = async (req, res) => {
    try {
        const { status } = req.query;
        const data = await kycService.listRequests({ status });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.approve = async (req, res) => {
    try {
        const data = await kycService.approve(req.params.id, req.user.id);
        return res.json({ success: true, message: "KYC upgrade approved", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.reject = async (req, res) => {
    try {
        const data = await kycService.reject(req.params.id, req.body.reason, req.user.id);
        return res.json({ success: true, message: "KYC upgrade rejected", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
