const efdService = require("./efd.service");

exports.registerTaxInfo = async (req, res) => {
    try {
        const data = await efdService.registerTaxInfo(req.user.id, req.body);
        return res.json({ success: true, message: "Tax info submitted for verification", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getMyTaxInfo = async (req, res) => {
    try {
        const data = await efdService.getMyTaxInfo(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getMyReceipts = async (req, res) => {
    try {
        const data = await efdService.getMyReceipts(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getReceiptForOrder = async (req, res) => {
    try {
        const isAdmin = req.user.role === "admin";
        const data = await efdService.getReceiptForOrder(req.params.orderId, req.user.id, isAdmin);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listPendingRegistrations = async (req, res) => {
    try {
        const data = await efdService.listPendingRegistrations();
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.verifyRegistration = async (req, res) => {
    try {
        const data = await efdService.verifyRegistration(req.params.userId, Boolean(req.body.approved));
        return res.json({ success: true, message: "Registration status updated", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
