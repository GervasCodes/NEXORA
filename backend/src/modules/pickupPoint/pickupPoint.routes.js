const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const pickupPointController = require("./pickupPoint.controller");
const { createValidation, idValidation } = require("./pickupPoint.validator");

// Public: any buyer picking a delivery destination at checkout needs to
// browse these before they've necessarily even logged in on this
// device (cart persists across sessions) - no auth required to list.
router.get("/", pickupPointController.listActive);

router.use(authMiddleware, authorize("admin"));
router.get("/admin", pickupPointController.listAll);
router.post("/admin", createValidation, validationMiddleware, pickupPointController.create);
router.put("/admin/:id", idValidation, validationMiddleware, pickupPointController.update);

module.exports = router;
