const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const requireServiceProvider = require("../../middleware/requireServiceProvider.middleware");
const upload = require("../../middleware/upload.middleware");
const uploadVideo = require("../../middleware/uploadVideo.middleware");

const { createServiceValidation, createPricingRuleValidation } = require("./service.validator");
const serviceController = require("./service.controller");

// Public
router.get("/", serviceController.listServices);

// Phase 4 (Customer Experience) - must come before the "/:slug"
// catch-all below, same ordering reasoning product.routes.js's own
// "/filters/regions" documents.
router.get("/filters/regions", serviceController.listFilterRegions);

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

// --- Dynamic pricing rules (Phase 5 - Growth) --------------------------

router.post(
    "/:id/pricing-rules",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    createPricingRuleValidation,
    serviceController.createPricingRule
);

router.get(
    "/:id/pricing-rules",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    serviceController.getPricingRules
);

router.put(
    "/pricing-rules/:ruleId/deactivate",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    serviceController.deactivatePricingRule
);

router.put(
    "/pricing-rules/:ruleId/activate",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    serviceController.activatePricingRule
);

router.delete(
    "/pricing-rules/:ruleId",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    serviceController.deletePricingRule
);

module.exports = router;
