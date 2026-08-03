const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const statusController = require("./status.controller");
const { createIncidentValidation, updateIncidentValidation } = require("./status.validator");

// Public - what the status page (frontend) renders.
router.get("/", statusController.getPublicStatus);

// Admin incident management.
router.get("/admin/incidents", authMiddleware, authorize("admin"), statusController.listForAdmin);
router.post("/admin/incidents", authMiddleware, authorize("admin"), createIncidentValidation, validationMiddleware, statusController.createIncident);
router.put("/admin/incidents/:id", authMiddleware, authorize("admin"), updateIncidentValidation, validationMiddleware, statusController.updateIncident);

module.exports = router;
