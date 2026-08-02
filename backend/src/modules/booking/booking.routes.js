const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const requireServiceProvider = require("../../middleware/requireServiceProvider.middleware");
const maintenanceCheck = require("../../middleware/maintenance.middleware");

const bookingController = require("./booking.controller");
const { createBookingValidation, bookingIdValidation } = require("./booking.validator");

// Buyer-side (gated: new booking activity is what the admin's
// Maintenance toggle turns off; providers below keep managing bookings
// already on their calendar, and the shared routes further down still
// let either side view/cancel an existing booking)
router.post(
    "/",
    authMiddleware,
    authorize("buyer"),
    maintenanceCheck("bookings"),
    createBookingValidation,
    validationMiddleware,
    bookingController.createBooking
);

router.get(
    "/mine",
    authMiddleware,
    authorize("buyer"),
    maintenanceCheck("bookings"),
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

// Phase 5 (Booking Status Review): provider-only, mirrors /confirm -
// only valid while the booking is still pending (see
// booking.service.js#rejectBooking).
router.put(
    "/:id/reject",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireServiceProvider,
    bookingIdValidation,
    validationMiddleware,
    bookingController.rejectBooking
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
