const contentService = require("./content.service");

exports.listPublished = async (req, res) => {
    try {
        const { category_id, page = 1, limit = 20 } = req.query;
        const data = await contentService.listPublished({
            categoryId: category_id,
            limit: Number(limit),
            offset: (Number(page) - 1) * Number(limit)
        });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getBySlug = async (req, res) => {
    try {
        const data = await contentService.getBySlug(req.params.slug);
        if (!data) return res.status(404).json({ success: false, message: "Article not found" });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listAllAdmin = async (req, res) => {
    try {
        const data = await contentService.listAllAdmin();
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getByIdAdmin = async (req, res) => {
    try {
        const data = await contentService.getByIdAdmin(req.params.id);
        if (!data) return res.status(404).json({ success: false, message: "Article not found" });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const data = await contentService.create(req.user.id, req.body);
        return res.status(201).json({ success: true, message: "Article created", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.update = async (req, res) => {
    try {
        const data = await contentService.update(req.params.id, req.body);
        return res.json({ success: true, message: "Article updated", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.setStatus = async (req, res) => {
    try {
        const data = await contentService.setStatus(req.params.id, req.body.status);
        return res.json({ success: true, message: "Article status updated", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
