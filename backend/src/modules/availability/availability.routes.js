const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const requireServiceProvider = require("../../middleware/requireServiceProvider.middleware");

const availabilityController = require("./availability.controller");
const { setAvailabilityValidation } = require("./availability.validator");

// Public - buyer date picker reads this before a booking is even
// attempted, and booking.service.js re-checks the same data server-side
// before actually committing a booking.
router.get("/:serviceId/availability", availabilityController.getAvailability);

router.put(
    "/:serviceId/availability",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    setAvailabilityValidation,
    validationMiddleware,
    availabilityController.setAvailability
);

module.exports = router;
