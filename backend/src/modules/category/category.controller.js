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
        if (error.isMaintenance) {
            return res.status(503).json({
                success: false,
                code: "DEPARTMENT_MAINTENANCE",
                message: error.message,
                data: { name: error.departmentName, estimatedReturn: error.estimatedReturn }
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

// True deactivation - hides the department completely (no listing, no
// maintenance page). See enterMaintenance below for the "still linked,
// shoppers see a maintenance page" alternative.
exports.deactivateCategory = async (req, res) => {
    try {
        await categoryService.deactivateDepartment(req.params.id);

        return res.json({
            success: true,
            message: "Department deactivated - it's now hidden everywhere"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Puts a department into maintenance - still reachable by direct link,
// shoppers see a maintenance page/message instead of its products.
exports.enterMaintenance = async (req, res) => {
    try {
        await categoryService.setCategoryActive(req.params.id, false, req.body?.message);

        return res.json({
            success: true,
            message: "Department put into maintenance"
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

exports.scheduleMaintenance = async (req, res) => {
    try {
        const { start_at, end_at, message } = req.body;

        const { startedNow } = await categoryService.scheduleMaintenance(
            req.params.id,
            start_at,
            end_at,
            message
        );

        return res.json({
            success: true,
            message: startedNow
                ? "Maintenance started now and will restore automatically at the scheduled end time"
                : "Maintenance window scheduled"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.cancelScheduledMaintenance = async (req, res) => {
    try {
        await categoryService.cancelScheduledMaintenance(req.params.id);

        return res.json({
            success: true,
            message: "Scheduled maintenance cancelled"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
