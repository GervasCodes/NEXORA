const disputeService = require("./dispute.service");

exports.createDispute = async (req, res) => {
    try {
        const dispute = await disputeService.createDispute(req.user.id, req.body);
        return res.status(201).json({
            success: true,
            message: "Dispute filed successfully",
            data: dispute
        });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.addEvidence = async (req, res) => {
    try {
        const dispute = await disputeService.addEvidence(
            req.params.id,
            req.user.id,
            req.user.role,
            req.file
        );
        return res.json({ success: true, message: "Evidence added", data: dispute });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.addMessage = async (req, res) => {
    try {
        const dispute = await disputeService.addMessage(
            req.params.id,
            req.user.id,
            req.user.role,
            req.body.message
        );
        return res.json({ success: true, message: "Message added", data: dispute });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getDetail = async (req, res) => {
    try {
        const dispute = await disputeService.getDisputeDetail(req.params.id, req.user.id, req.user.role);
        return res.json({ success: true, data: dispute });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getMyDisputes = async (req, res) => {
    try {
        const data = await disputeService.getMyDisputes(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getSellerDisputes = async (req, res) => {
    try {
        const data = await disputeService.getSellerDisputes(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getAllDisputes = async (req, res) => {
    try {
        const { status, type } = req.query;
        const data = await disputeService.getAllDisputes({ status, type });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.withdrawDispute = async (req, res) => {
    try {
        const dispute = await disputeService.withdrawDispute(req.params.id, req.user.id);
        return res.json({ success: true, message: "Dispute withdrawn", data: dispute });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.markUnderReview = async (req, res) => {
    try {
        const dispute = await disputeService.markUnderReview(req.params.id, req.user.id);
        return res.json({ success: true, message: "Dispute moved to review", data: dispute });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.resolveDispute = async (req, res) => {
    try {
        const dispute = await disputeService.resolveDispute(req.params.id, req.user.id, req.body);
        return res.json({ success: true, message: "Dispute resolved", data: dispute });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.rejectDispute = async (req, res) => {
    try {
        const dispute = await disputeService.rejectDispute(req.params.id, req.user.id, req.body);
        return res.json({ success: true, message: "Dispute rejected", data: dispute });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
