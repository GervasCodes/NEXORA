const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const maintenanceController = require("./maintenance.controller");
const { setModuleActiveValidation } = require("./maintenance.validator");

// Everything here is admin-only - this section is purely for the
// Maintenance Management screen in the Admin Panel. Departments and
// services keep their own activate/deactivate routes on
// category.routes.js / serviceCategory.routes.js (getOverview above just
// reads their admin-list endpoints); only module-level toggles live here.
router.use(authMiddleware, authorize("admin"));

router.get("/overview", maintenanceController.getOverview);

router.put(
    "/modules/:key/deactivate",
    setModuleActiveValidation,
    validationMiddleware,
    maintenanceController.deactivateModule
);

router.put(
    "/modules/:key/activate",
    setModuleActiveValidation,
    validationMiddleware,
    maintenanceController.activateModule
);

module.exports = router;
