const express = require("express");
const router = express.Router();

const holidayThemeController = require("./holidayTheme.controller");

// Public and read-only. Changing the setting goes through the admin-only
// PUT /admin/settings (holiday_theme_* keys), which keeps the audit history.
router.get("/", holidayThemeController.getPublic);

module.exports = router;
