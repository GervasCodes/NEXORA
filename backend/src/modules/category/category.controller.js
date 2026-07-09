const categoryService = require("./category.service");

exports.listPublic = async (req, res) => {
    try {
        const categories = await categoryService.listPublic();

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
        const categories = await categoryService.listForAdmin();

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

exports.createCategory = async (req, res) => {
    try {
        const { name, description } = req.body;

        const result = await categoryService.createCategory(name, description);

        return res.status(201).json({
            success: true,
            message: "Category created",
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
        const { name, description } = req.body;

        await categoryService.updateCategory(req.params.id, name, description);

        return res.json({
            success: true,
            message: "Category updated"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.deactivateCategory = async (req, res) => {
    try {
        await categoryService.setCategoryActive(req.params.id, false);

        return res.json({
            success: true,
            message: "Category deactivated"
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
        await categoryService.setCategoryActive(req.params.id, true);

        return res.json({
            success: true,
            message: "Category activated"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
