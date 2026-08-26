const returnService = require("./return.service");

exports.requestReturn = async (req, res) => {
    try {
        const data = await returnService.requestReturn(req.user.id, req.body);
        return res.status(201).json({ success: true, message: "Return requested", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.cancelReturn = async (req, res) => {
    try {
        const data = await returnService.cancelReturn(req.params.id, req.user.id);
        return res.json({ success: true, message: "Return cancelled", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.markShippedBack = async (req, res) => {
    try {
        const data = await returnService.markShippedBack(req.params.id, req.user.id, req.body);
        return res.json({ success: true, message: "Return marked as shipped back", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getMyReturns = async (req, res) => {
    try {
        const data = await returnService.getMyReturns(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getSellerReturns = async (req, res) => {
    try {
        const data = await returnService.getSellerReturns(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getAllReturns = async (req, res) => {
    try {
        const { status } = req.query;
        const data = await returnService.getAllReturns({ status });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.approveReturn = async (req, res) => {
    try {
        const data = await returnService.approveReturn(req.params.id, req.user.id, req.user.role);
        return res.json({ success: true, message: "Return approved", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.rejectReturn = async (req, res) => {
    try {
        const data = await returnService.rejectReturn(req.params.id, req.user.id, req.user.role, req.body.reason);
        return res.json({ success: true, message: "Return rejected", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.markReceived = async (req, res) => {
    try {
        const data = await returnService.markReceived(req.params.id, req.user.id, req.user.role);
        return res.json({ success: true, message: "Return marked as received - refund triggered", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getDetail = async (req, res) => {
    try {
        const data = await returnService.getDetail(req.params.id, req.user.id, req.user.role);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.addEvidence = async (req, res) => {
    try {
        const data = await returnService.addEvidence(req.params.id, req.user.id, req.user.role, req.file);
        return res.json({ success: true, message: "Evidence added", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
