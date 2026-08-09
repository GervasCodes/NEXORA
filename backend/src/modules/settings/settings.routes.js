const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const settingsController = require("./settings.controller");

// Authenticated (any role), not admin-only - distinct from the
// admin-only GET /admin/monetization, which also includes
// last-changed-by/audit detail this endpoint deliberately omits.
router.get("/monetization-status", authMiddleware, settingsController.getStatus);

module.exports = router;
