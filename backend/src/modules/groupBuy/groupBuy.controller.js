const groupBuyService = require("./groupBuy.service");

exports.create = async (req, res) => {
    try {
        const data = await groupBuyService.create(req.user.id, req.body);
        return res.status(201).json({ success: true, message: "Group buy created", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listOpen = async (req, res) => {
    try {
        const { product_id } = req.query;
        const data = await groupBuyService.listOpen({ productId: product_id });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getById = async (req, res) => {
    try {
        const data = await groupBuyService.getById(req.params.id);
        if (!data) return res.status(404).json({ success: false, message: "Group buy not found" });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listMine = async (req, res) => {
    try {
        const data = await groupBuyService.listBySeller(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listMyParticipations = async (req, res) => {
    try {
        const data = await groupBuyService.listMyParticipations(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.join = async (req, res) => {
    try {
        const data = await groupBuyService.join(req.params.id, req.user.id);
        return res.json({ success: true, message: "You've joined this group buy", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.claim = async (req, res) => {
    try {
        const data = await groupBuyService.claim(req.params.id, req.user.id, req.body);
        return res.status(201).json({ success: true, message: "Order created - complete payment to finish", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
