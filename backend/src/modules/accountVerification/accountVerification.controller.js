const accountVerificationService = require("./accountVerification.service");

exports.list = async (req, res) => {
    try {
        const { status, role } = req.query;
        const data = await accountVerificationService.list({ status, role });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getDetail = async (req, res) => {
    try {
        const data = await accountVerificationService.getDetail(req.params.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.approve = async (req, res) => {
    try {
        const data = await accountVerificationService.approve(req.params.id, req.user.id);
        return res.json({ success: true, message: "Account verification approved.", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.reject = async (req, res) => {
    try {
        const data = await accountVerificationService.reject(req.params.id, req.body.reason, req.user.id);
        return res.json({ success: true, message: "Account verification rejected.", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
