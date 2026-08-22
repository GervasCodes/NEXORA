const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const affiliateController = require("./affiliate.controller");
const { trackClickValidation } = require("./affiliate.validator");

// Public - a landing page with ?ref=CODE tracks its click before the
// visitor has necessarily logged in (see affiliate.service.js's header
// comment on the SPA-friendly tracking approach).
router.post("/click", trackClickValidation, validationMiddleware, affiliateController.trackClick);

router.use(authMiddleware, authorize("buyer"));
router.post("/apply", affiliateController.apply);
router.get("/me", affiliateController.getDashboard);

module.exports = router;
