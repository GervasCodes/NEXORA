const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const upload = require("../../middleware/upload.middleware");

const serviceCategoryController = require("./serviceCategory.controller");
const {
    createServiceCategoryValidation,
    updateServiceCategoryValidation,
    serviceCategoryIdValidation
} = require("./serviceCategory.validator");

// Public
router.get("/", serviceCategoryController.listPublic);

// Public - category grid with live listing counts (services-marketplace
// equivalent of GET /categories/departments)
router.get("/browse", serviceCategoryController.listWithCounts);

router.get("/:slug", serviceCategoryController.getBySlug);

// Admin only
router.get(
    "/admin/all",
    authMiddleware,
    authorize("admin"),
    serviceCategoryController.listForAdmin
);

router.post(
    "/:id/cover",
    authMiddleware,
    authorize("admin"),
    serviceCategoryIdValidation,
    validationMiddleware,
    upload.single("cover"),
    serviceCategoryController.uploadCover
);

router.post(
    "/",
    authMiddleware,
    authorize("admin"),
    createServiceCategoryValidation,
    validationMiddleware,
    serviceCategoryController.createCategory
);

router.put(
    "/:id",
    authMiddleware,
    authorize("admin"),
    updateServiceCategoryValidation,
    validationMiddleware,
    serviceCategoryController.updateCategory
);

router.put(
    "/:id/deactivate",
    authMiddleware,
    authorize("admin"),
    serviceCategoryIdValidation,
    validationMiddleware,
    serviceCategoryController.deactivateCategory
);

router.put(
    "/:id/activate",
    authMiddleware,
    authorize("admin"),
    serviceCategoryIdValidation,
    validationMiddleware,
    serviceCategoryController.activateCategory
);

// Distinct from /deactivate above - puts a category into maintenance
// (still linked, shoppers see a maintenance page) rather than hiding it.
router.put(
    "/:id/maintenance",
    authMiddleware,
    authorize("admin"),
    serviceCategoryIdValidation,
    validationMiddleware,
    serviceCategoryController.enterMaintenance
);

module.exports = router;
