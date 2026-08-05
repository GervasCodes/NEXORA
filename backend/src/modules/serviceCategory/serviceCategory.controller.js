const serviceCategoryService = require("./serviceCategory.service");

exports.listPublic = async (req, res) => {
    try {
        const categories = await serviceCategoryService.listPublic();

        return res.json({
            success: true,
            data: categories
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.listForAdmin = async (req, res) => {
    try {
        const categories = await serviceCategoryService.listForAdmin();

        return res.json({
            success: true,
            data: categories
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.listWithCounts = async (req, res) => {
    try {
        const categories = await serviceCategoryService.listWithCounts();

        return res.json({
            success: true,
            data: categories
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getBySlug = async (req, res) => {
    try {
        const category = await serviceCategoryService.getBySlug(req.params.slug);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Service category not found"
            });
        }

        return res.json({
            success: true,
            data: category
        });

    } catch (error) {
        if (error.isMaintenance) {
            return res.status(503).json({
                success: false,
                code: "DEPARTMENT_MAINTENANCE",
                message: error.message,
                data: { name: error.categoryName }
            });
        }

        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.createCategory = async (req, res) => {
    try {
        const { name, description, display_order } = req.body;

        const result = await serviceCategoryService.createCategory(name, description, display_order);

        return res.status(201).json({
            success: true,
            message: "Service category created",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.updateCategory = async (req, res) => {
    try {
        const { name, description, display_order } = req.body;

        await serviceCategoryService.updateCategory(req.params.id, name, description, display_order);

        return res.json({
            success: true,
            message: "Service category updated"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.uploadCover = async (req, res) => {
    try {
        const coverUrl = await serviceCategoryService.uploadCoverImage(req.params.id, req.file);

        return res.json({
            success: true,
            message: "Cover image uploaded",
            data: { coverUrl }
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// True deactivation - hides the category completely.
exports.deactivateCategory = async (req, res) => {
    try {
        await serviceCategoryService.deactivateCategory(req.params.id);

        return res.json({
            success: true,
            message: "Service category deactivated - it's now hidden everywhere"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Puts a category into maintenance - still reachable by direct link,
// shoppers see a maintenance page/message instead of its listings.
exports.enterMaintenance = async (req, res) => {
    try {
        await serviceCategoryService.setCategoryActive(req.params.id, false, req.body?.message);

        return res.json({
            success: true,
            message: "Service category put into maintenance"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.activateCategory = async (req, res) => {
    try {
        await serviceCategoryService.setCategoryActive(req.params.id, true);

        return res.json({
            success: true,
            message: "Service category activated"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
