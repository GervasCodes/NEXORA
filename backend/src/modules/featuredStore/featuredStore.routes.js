const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const featuredStoreController = require("./featuredStore.controller");
const { createCampaignValidation, campaignIdValidation } = require("./featuredStore.validator");

router.use(authMiddleware, authorize("seller"), requireApprovedSeller);

router.get("/pricing", featuredStoreController.getPricing);

router.get("/categories", featuredStoreController.getEligibleCategories);

router.get("/campaigns", featuredStoreController.getMyCampaigns);

router.post(
    "/campaigns",
    createCampaignValidation,
    validationMiddleware,
    featuredStoreController.createCampaign
);

router.put(
    "/campaigns/:id/cancel",
    campaignIdValidation,
    validationMiddleware,
    featuredStoreController.cancelCampaign
);

module.exports = router;
