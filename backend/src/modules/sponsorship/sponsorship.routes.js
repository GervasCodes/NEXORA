const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const sponsorshipController = require("./sponsorship.controller");
const { createCampaignValidation, campaignIdValidation } = require("./sponsorship.validator");

router.use(authMiddleware, authorize("seller"), requireApprovedSeller);

router.get("/pricing", sponsorshipController.getPricing);

router.get("/campaigns", sponsorshipController.getMyCampaigns);

router.post(
    "/campaigns",
    createCampaignValidation,
    validationMiddleware,
    sponsorshipController.createCampaign
);

router.put(
    "/campaigns/:id/cancel",
    campaignIdValidation,
    validationMiddleware,
    sponsorshipController.cancelCampaign
);

module.exports = router;
