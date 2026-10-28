const express = require("express");
const router = express.Router();

const validationMiddleware = require("../../middleware/validation.middleware");
const searchController = require("./search.controller");
const { logQueryValidation } = require("./search.validator");

// Public - trending terms for SearchBox.jsx's empty-input dropdown (shown
// alongside recent searches, which are per-device/localStorage only).
router.get("/trending", searchController.getTrending);

// Public, fire-and-forget - SearchBox.jsx calls this on submit without
// awaiting or inspecting the response, so a 400 from validationMiddleware
// on a malformed body is harmless (nothing reads it). The controller's own
// try/catch below that point only covers failures from the service/DB.
router.post("/log", logQueryValidation, validationMiddleware, searchController.logQuery);

module.exports = router;
