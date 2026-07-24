const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const upload = require("../../middleware/upload.middleware");

const categoryController = require("./category.controller");
const {
    createCategoryValidation,
    updateCategoryValidation,
    categoryIdValidation
} = require("./category.validator");

// Public
router.get("/", categoryController.listPublic);

// Public - homepage department cards (cover, live product count, trending preview)
router.get("/departments", categoryController.listDepartments);

// Public - single department page: same summary fields plus the
// Phase 2C sections (promotions, sponsored, featured stores)
router.get("/departments/:slug", categoryController.getDepartment);

// Admin only
router.get(
    "/admin/all",
    authMiddleware,
    authorize("admin"),
    categoryController.listForAdmin
);

router.post(
    "/:id/cover",
    authMiddleware,
    authorize("admin"),
    categoryIdValidation,
    validationMiddleware,
    upload.single("cover"),
    categoryController.uploadCover
);

router.post(
    "/",
    authMiddleware,
    authorize("admin"),
    createCategoryValidation,
    validationMiddleware,
    categoryController.createCategory
);

router.put(
    "/:id",
    authMiddleware,
    authorize("admin"),
    updateCategoryValidation,
    validationMiddleware,
    categoryController.updateCategory
);

router.put(
    "/:id/deactivate",
    authMiddleware,
    authorize("admin"),
    categoryIdValidation,
    validationMiddleware,
    categoryController.deactivateCategory
);

router.put(
    "/:id/activate",
    authMiddleware,
    authorize("admin"),
    categoryIdValidation,
    validationMiddleware,
    categoryController.activateCategory
);

module.exports = router;
