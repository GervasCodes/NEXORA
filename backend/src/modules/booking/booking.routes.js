const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const requireServiceProvider = require("../../middleware/requireServiceProvider.middleware");

const bookingController = require("./booking.controller");
const { createBookingValidation, bookingIdValidation } = require("./booking.validator");

// Buyer-side
router.post(
    "/",
    authMiddleware,
    authorize("buyer"),
    createBookingValidation,
    validationMiddleware,
    bookingController.createBooking
);

router.get(
    "/mine",
    authMiddleware,
    authorize("buyer"),
    bookingController.getMyBookings
);

// Provider-side
router.get(
    "/provider/mine",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    bookingController.getProviderBookings
);

router.put(
    "/:id/confirm",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    bookingIdValidation,
    validationMiddleware,
    bookingController.confirmBooking
);

// Shared - either the customer or the provider on the booking (the
// controller/service layer checks which, and that it's actually theirs)
router.get(
    "/:id",
    authMiddleware,
    bookingIdValidation,
    validationMiddleware,
    bookingController.getBookingById
);

router.put(
    "/:id/cancel",
    authMiddleware,
    bookingIdValidation,
    validationMiddleware,
    bookingController.cancelBooking
);

module.exports = router;
