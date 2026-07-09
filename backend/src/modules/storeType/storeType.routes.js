const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const storeTypeController = require("./storeType.controller");
const {
    createStoreTypeValidation,
    updateStoreTypeValidation,
    storeTypeIdValidation
} = require("./storeType.validator");

// Public - sellers pick from this list at registration, buyers could browse by it later
router.get("/", storeTypeController.listPublic);

// Admin only
router.get("/admin/all", authMiddleware, authorize("admin"), storeTypeController.listForAdmin);

router.post(
    "/",
    authMiddleware,
    authorize("admin"),
    createStoreTypeValidation,
    validationMiddleware,
    storeTypeController.createStoreType
);

router.put(
    "/:id",
    authMiddleware,
    authorize("admin"),
    updateStoreTypeValidation,
    validationMiddleware,
    storeTypeController.updateStoreType
);

router.put(
    "/:id/deactivate",
    authMiddleware,
    authorize("admin"),
    storeTypeIdValidation,
    validationMiddleware,
    storeTypeController.deactivateStoreType
);

router.put(
    "/:id/activate",
    authMiddleware,
    authorize("admin"),
    storeTypeIdValidation,
    validationMiddleware,
    storeTypeController.activateStoreType
);

module.exports = router;
