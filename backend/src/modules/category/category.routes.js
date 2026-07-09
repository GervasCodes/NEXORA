const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const categoryController = require("./category.controller");
const {
    createCategoryValidation,
    updateCategoryValidation,
    categoryIdValidation
} = require("./category.validator");

// Public
router.get("/", categoryController.listPublic);

// Admin only
router.get(
    "/admin/all",
    authMiddleware,
    authorize("admin"),
    categoryController.listForAdmin
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
