const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const requireServiceProvider = require("../../middleware/requireServiceProvider.middleware");
const maintenanceCheck = require("../../middleware/maintenance.middleware");

const bookingController = require("./booking.controller");
const { createBookingValidation, bookingIdValidation, rescheduleBookingValidation } = require("./booking.validator");

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

// Phase 7 (UI/UX remediation) - reschedule. Buyer-only (unlike
// /:id/cancel and /:id above, which are shared between customer and
// provider) since rescheduleBooking's own ownership check in
// booking.service.js only ever validates against booking.customer_id -
// a provider changing their own calendar availability is a different,
// separate concern this endpoint doesn't cover.
router.put(
    "/:id/reschedule",
    authMiddleware,
    authorize("buyer"),
    bookingIdValidation,
    rescheduleBookingValidation,
    validationMiddleware,
    bookingController.rescheduleBooking
);

module.exports = router;
