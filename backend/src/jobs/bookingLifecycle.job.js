// Phase 3 (Nexora Services - Financial Integration). Advances paid
// bookings through CHANGES.md's own Booking Lifecycle
// (CONFIRMED -> ACTIVE -> COMPLETED) as their dates pass, with no user
// action required - see booking.repository.js#activateStartedBookings /
// #completeFinishedBookings for why this is date-driven rather than a
// manual endpoint. "Completed" is also the gate the escrow release job
// (escrowRelease.job.js) waits on before a provider's held booking
// earnings become releasable, so this job needs to run before that one
// each hour for a booking's hold-day countdown to start on the day it
// actually finished, not a day (or an hour) later.
const bookingRepository = require("../modules/booking/booking.repository");
const notificationService = require("../modules/notification/notification.service");

exports.run = async () => {
    const activated = await bookingRepository.activateStartedBookings();

    if (activated) {
        console.log(`[bookingLifecycle job] activated ${activated} booking(s)`);
    }

    // Fetched before the bulk UPDATE below so the notification loop knows
    // exactly which bookings just finished, not merely how many.
    const completing = await bookingRepository.findBookingsCompletingToday();
    const completed = await bookingRepository.completeFinishedBookings();

    if (completed) {
        console.log(`[bookingLifecycle job] completed ${completed} booking(s)`);
    }

    for (const booking of completing) {
        // Booking Completed, per CHANGES.md's own Notifications list -
        // plain title/message, same fallback path booking.service.js's
        // other notify() calls already use.
        notificationService.notify({
            userId: booking.customer_id,
            type: "booking_completed",
            title: "Booking completed",
            message: `Your booking ${booking.booking_reference} is now complete. Leave a review to help other customers.`,
            url: `/bookings/${booking.id}`
        }).catch((err) => console.error("booking completed notify error:", err));

        notificationService.notify({
            userId: booking.provider_id,
            type: "booking_completed",
            title: "Booking completed",
            message: `Booking ${booking.booking_reference} is now complete. Its held earnings will release after the escrow hold period.`,
            url: `/seller/bookings/${booking.id}`
        }).catch((err) => console.error("booking completed notify error:", err));
    }
};
