const maintenanceService = require("./maintenance.service");

exports.getOverview = async (req, res) => {
    try {
        const overview = await maintenanceService.getOverview();

        return res.json({
            success: true,
            data: overview
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.deactivateModule = async (req, res) => {
    try {
        await maintenanceService.setModuleActive(
            req.params.key,
            false,
            req.body.message,
            req.user.id
        );

        return res.json({
            success: true,
            message: "Module put into maintenance mode"
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.activateModule = async (req, res) => {
    try {
        await maintenanceService.setModuleActive(
            req.params.key,
            true,
            null,
            req.user.id
        );

        return res.json({
            success: true,
            message: "Module restored"
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
