const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const contentController = require("./content.controller");
const { createValidation, idValidation, setStatusValidation } = require("./content.validator");

// --- Public ---
router.get("/", contentController.listPublished);

// --- Admin --- (mounted before "/:slug" so "admin" is never matched
// as a slug - same reasoning as every other admin-list-vs-shared-id
// route split in this codebase)
router.get("/admin", authMiddleware, authorize("admin"), contentController.listAllAdmin);
router.get("/admin/:id", authMiddleware, authorize("admin"), idValidation, validationMiddleware, contentController.getByIdAdmin);
router.post("/admin", authMiddleware, authorize("admin"), createValidation, validationMiddleware, contentController.create);
router.put("/admin/:id", authMiddleware, authorize("admin"), idValidation, validationMiddleware, contentController.update);
router.put("/admin/:id/status", authMiddleware, authorize("admin"), setStatusValidation, validationMiddleware, contentController.setStatus);

// --- Public (slug) ---
router.get("/:slug", contentController.getBySlug);

module.exports = router;
