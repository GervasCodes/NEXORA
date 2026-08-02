const maintenanceService = require("../modules/maintenance/maintenance.service");

// Factory: router.use(maintenanceCheck("wallet")) at the top of a
// module's routes file puts every route in that file behind the admin's
// Maintenance Management toggle for that module_key. On a disabled
// module this returns 503 (not 401/404/500) with a stable `code` so the
// frontend can render the maintenance animation instead of a generic
// error toast - see api/client.js and MaintenanceScreen.jsx.
//
// Fails open on an unexpected error (e.g. a DB hiccup while reading the
// cache) - a bug in the maintenance check itself should never be able to
// take a whole module offline for every user.
module.exports = (moduleKey) => async (req, res, next) => {
    try {
        const { isActive, message } = await maintenanceService.getModuleStatus(moduleKey);

        if (!isActive) {
            return res.status(503).json({
                success: false,
                code: "MODULE_MAINTENANCE",
                message: message || "This feature is temporarily unavailable for maintenance. Please check back soon.",
                data: { module: moduleKey }
            });
        }

        next();
    } catch (error) {
        next();
    }
};
