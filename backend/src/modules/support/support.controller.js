const supportService = require("./support.service");

exports.createTicket = async (req, res) => {
    try {
        const data = await supportService.createTicket(req.user.id, req.body);
        return res.status(201).json({ success: true, message: "Support ticket created", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getMyTickets = async (req, res) => {
    try {
        const data = await supportService.getMyTickets(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getTicket = async (req, res) => {
    try {
        const isAdmin = req.user.role === "admin";
        const data = await supportService.getTicket(req.params.id, req.user.id, isAdmin);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.reply = async (req, res) => {
    try {
        const isAdmin = req.user.role === "admin";
        const data = await supportService.reply(req.params.id, req.user.id, isAdmin, req.body.body);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listAll = async (req, res) => {
    try {
        const { status } = req.query;
        const data = await supportService.listAll({ status });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.setStatus = async (req, res) => {
    try {
        const data = await supportService.setStatus(req.params.id, req.body.status);
        return res.json({ success: true, message: "Ticket status updated", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
