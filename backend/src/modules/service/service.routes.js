const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const requireServiceProvider = require("../../middleware/requireServiceProvider.middleware");
const upload = require("../../middleware/upload.middleware");
const uploadVideo = require("../../middleware/uploadVideo.middleware");

const { createServiceValidation } = require("./service.validator");
const serviceController = require("./service.controller");

// Public
router.get("/", serviceController.listServices);

router.get("/:slug", serviceController.getServiceBySlug);

router.post(
    "/",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    createServiceValidation,
    serviceController.createService
);

router.post(
    "/:id/images",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    upload.single("image"),
    serviceController.uploadServiceImage
);

router.post(
    "/:id/videos",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    uploadVideo.single("video"),
    serviceController.uploadServiceVideo
);

router.get(
    "/mine/list",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    serviceController.getMyServices
);

router.get(
    "/mine/:id",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    serviceController.getMyServiceById
);

router.put(
    "/:id",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    serviceController.updateService
);

router.put(
    "/:id/publish",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    serviceController.publishService
);

router.put(
    "/:id/unpublish",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    serviceController.unpublishService
);

router.put(
    "/:id/deactivate",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    serviceController.deactivateMyService
);

router.put(
    "/:id/activate",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    serviceController.activateMyService
);

module.exports = router;
