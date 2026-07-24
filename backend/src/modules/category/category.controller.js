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

exports.listDepartments = async (req, res) => {
    try {
        const departments = await categoryService.listDepartments();

        return res.json({
            success: true,
            data: departments
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getDepartment = async (req, res) => {
    try {
        const department = await categoryService.getDepartmentBySlug(req.params.slug);

        if (!department) {
            return res.status(404).json({
                success: false,
                message: "Department not found"
            });
        }

        return res.json({
            success: true,
            data: department
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
        const { name, description, display_order } = req.body;

        const result = await categoryService.createCategory(name, description, display_order);

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
        const { name, description, display_order } = req.body;

        await categoryService.updateCategory(req.params.id, name, description, display_order);

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

exports.uploadCover = async (req, res) => {
    try {
        const coverUrl = await categoryService.uploadCoverImage(req.params.id, req.file);

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
