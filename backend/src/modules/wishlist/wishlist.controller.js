const wishlistService = require("./wishlist.service");

exports.getSaved = async (req, res) => {
    try {
        const items = await wishlistService.getSaved(req.user.id);
        res.json({ success: true, data: items });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.getIds = async (req, res) => {
    try {
        const ids = await wishlistService.getIds(req.user.id);
        res.json({ success: true, data: ids });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.add = async (req, res) => {
    try {
        await wishlistService.add(req.user.id, req.params.productId);
        res.status(201).json({ success: true, message: "Saved." });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.remove = async (req, res) => {
    try {
        await wishlistService.remove(req.user.id, req.params.productId);
        res.json({ success: true, message: "Removed." });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
