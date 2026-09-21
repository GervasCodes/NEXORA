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

// --- Verified Business tier upgrade ---

exports.getMyBusinessStatus = async (req, res) => {
    try {
        const data = await accountVerificationService.getBusinessStatus(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.submitBusinessRequest = async (req, res) => {
    try {
        const data = await accountVerificationService.submitBusinessRequest(req.user.id, req.files);
        return res.status(201).json({
            success: true,
            message: "Your Verified Business request has been submitted for review.",
            data
        });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listBusinessRequests = async (req, res) => {
    try {
        const data = await accountVerificationService.listBusinessRequests({ status: req.query.status });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getBusinessRequestDetail = async (req, res) => {
    try {
        const data = await accountVerificationService.getBusinessRequestDetail(req.params.requestId);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.approveBusinessRequest = async (req, res) => {
    try {
        const data = await accountVerificationService.approveBusinessRequest(req.params.requestId, req.user.id);
        return res.json({ success: true, message: "Verified Business request approved.", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.rejectBusinessRequest = async (req, res) => {
    try {
        const data = await accountVerificationService.rejectBusinessRequest(req.params.requestId, req.body.reason, req.user.id);
        return res.json({ success: true, message: "Verified Business request rejected.", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
