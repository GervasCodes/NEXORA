const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const departmentSponsorshipController = require("./departmentSponsorship.controller");
const { createCampaignValidation, campaignIdValidation } = require("./departmentSponsorship.validator");

router.use(authMiddleware, authorize("seller"), requireApprovedSeller);

router.get("/pricing", departmentSponsorshipController.getPricing);

router.get("/categories", departmentSponsorshipController.getEligibleCategories);

router.get("/campaigns", departmentSponsorshipController.getMyCampaigns);

router.post(
    "/campaigns",
    createCampaignValidation,
    validationMiddleware,
    departmentSponsorshipController.createCampaign
);

router.put(
    "/campaigns/:id/cancel",
    campaignIdValidation,
    validationMiddleware,
    departmentSponsorshipController.cancelCampaign
);

module.exports = router;
