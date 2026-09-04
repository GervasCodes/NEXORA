const sellerSavedFilterService = require("./sellerSavedFilter.service");

exports.list = async (req, res) => {
    try {
        const filters = await sellerSavedFilterService.list(req.user.id, req.params.pageKey);
        res.json({ success: true, data: filters });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const saved = await sellerSavedFilterService.create(
            req.user.id, req.params.pageKey, req.body.name, req.body.filters
        );
        res.status(201).json({ success: true, message: "Filter saved.", data: saved });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.remove = async (req, res) => {
    try {
        await sellerSavedFilterService.remove(req.user.id, req.params.id);
        res.json({ success: true, message: "Filter removed." });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
