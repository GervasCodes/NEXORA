const db = require("../../config/db");
const availabilityRepository = require("../availability/availability.repository");

// Create a booking + its per-date booking_items, decrementing
// service_availability for every date in the range, all in one
// transaction - same shape as order.repository.js#createOrder (insert
// parent row, insert line items while decrementing inventory, commit or
// roll back together).
//
// dateItems: [{ date, quantity, unitPrice, subtotal }, ...] - one entry
// per date in [startDate, endDate], already priced by
// booking.service.js against service_availability.
//
// Phase RF3: this used to run 2 queries per date (a per-date
// decrementUnits UPDATE + a per-date booking_items INSERT) - a 14-night
// booking was 28+ sequential queries in one transaction. Now it's a
// pre-check SELECT (to give the same per-date "no longer enough
// availability on <date>" error the old loop gave), one batched UPDATE
// covering every date, and one batched multi-row INSERT - 3 queries
// total regardless of how many nights are booked. The UPDATE's
// `available_units >= ?` guard still applies per row, so a date can
// never be oversold just because it's batched with others; the
// pre-check just makes the failure message specific instead of generic.
exports.createBooking = async (data) => {
    const {
        bookingReference, serviceId, providerId, customerId,
        startDate, endDate, quantity, amount, dateItems
    } = data;

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [bookingResult] = await connection.query(
            `INSERT INTO bookings
            (booking_reference, service_id, provider_id, customer_id,
             start_date, end_date, quantity, amount, status, payment_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unpaid')`,
            [bookingReference, serviceId, providerId, customerId, startDate, endDate, quantity, amount]
        );

        const bookingId = bookingResult.insertId;
        const dates = dateItems.map((item) => item.date);

        const availabilityRows = await availabilityRepository.findAvailabilityForDates(
            connection, serviceId, dates
        );
        const availabilityByDate = new Map(availabilityRows.map((row) => [
            row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date,
            row
        ]));

        for (const item of dateItems) {
            const row = availabilityByDate.get(item.date);

            if (!row || row.status !== "open" || row.available_units < quantity) {
                throw Object.assign(
                    new Error(`No longer enough availability on ${item.date}`),
                    { code: "AVAILABILITY_UNAVAILABLE" }
                );
            }
        }

        const affectedRows = await availabilityRepository.decrementUnitsForDates(
            connection, serviceId, dates, quantity
        );

        if (affectedRows < dateItems.length) {
            // Extremely rare race: something else decremented one of these
            // dates between our pre-check and this UPDATE. The guard
            // clause already prevented overselling either way - this is
            // just a safe, honest fallback message since we can no longer
            // point at one specific date with confidence.
            throw Object.assign(
                new Error("No longer enough availability for the selected dates"),
                { code: "AVAILABILITY_UNAVAILABLE" }
            );
        }

        const insertValues = dateItems.map((item) => [
            bookingId, item.date, quantity, item.unitPrice, item.subtotal
        ]);

        await connection.query(
            `INSERT INTO booking_items (booking_id, service_date, quantity, unit_price, subtotal)
            VALUES ?`,
            [insertValues]
        );

        await connection.commit();

        return bookingId;

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

exports.findById = async (bookingId) => {
    const [rows] = await db.query("SELECT * FROM bookings WHERE id = ?", [bookingId]);
    return rows[0];
};

exports.findItemsByBookingId = async (bookingId) => {
    const [rows] = await db.query(
        "SELECT service_date, quantity, unit_price, subtotal FROM booking_items WHERE booking_id = ? ORDER BY service_date ASC",
        [bookingId]
    );
    return rows;
};

exports.findByCustomer = async (customerId) => {
    const [rows] = await db.query(
        `SELECT b.*, s.title AS service_title, s.slug AS service_slug,
            sp.store_name
        FROM bookings b
        JOIN services s ON s.id = b.service_id
        JOIN seller_profiles sp ON sp.user_id = b.provider_id
        WHERE b.customer_id = ?
        ORDER BY b.created_at DESC`,
        [customerId]
    );
    return rows;
};

exports.findByProvider = async (providerId) => {
    const [rows] = await db.query(
        `SELECT b.*, s.title AS service_title, s.slug AS service_slug,
            u.first_name AS customer_first_name, u.last_name AS customer_last_name
        FROM bookings b
        JOIN services s ON s.id = b.service_id
        JOIN users u ON u.id = b.customer_id
        WHERE b.provider_id = ?
        ORDER BY b.created_at DESC`,
        [providerId]
    );
    return rows;
};

exports.setStatus = async (bookingId, status) => {
    await db.query("UPDATE bookings SET status = ? WHERE id = ?", [status, bookingId]);
};

// Set once the booking's payment webhook confirms success - mirrors
// order.repository.js#updatePaymentStatus exactly (Phase 3).
exports.updatePaymentStatus = async (bookingId, paymentStatus) => {
    await db.query(
        "UPDATE bookings SET payment_status = ? WHERE id = ?",
        [paymentStatus, bookingId]
    );
};

// ---- Lifecycle automation (Phase 3 - Financial Integration) ----------------
// A booking's CONFIRMED -> ACTIVE -> COMPLETED transitions (CHANGES.md's
// own Booking Lifecycle) are date-driven, not a user action - a hotel
// stay "becomes active" the day the guest checks in and "completes" the
// day they check out, regardless of whether anyone clicks anything. Only
// paid bookings are auto-advanced: an unpaid confirmed booking sitting
// past its start date is stale, not "in progress" - staleOrders.job.js's
// equivalent problem for orders, left for that same class of cleanup
// rather than silently marking an unpaid booking active/completed. See
// jobs/bookingLifecycle.job.js, the thin scheduling wrapper that calls
// these two.
exports.activateStartedBookings = async () => {
    const [result] = await db.query(
        `UPDATE bookings
        SET status = 'active'
        WHERE status = 'confirmed' AND payment_status = 'paid' AND start_date <= CURDATE()`
    );
    return result.affectedRows;
};

exports.completeFinishedBookings = async () => {
    const [result] = await db.query(
        `UPDATE bookings
        SET status = 'completed'
        WHERE status = 'active' AND payment_status = 'paid' AND end_date < CURDATE()`
    );
    return result.affectedRows;
};

// Bookings that just flipped to 'completed' on this tick, so the job can
// raise a "Booking Completed" notification per booking (CHANGES.md's own
// Notifications list) without the bulk UPDATE above losing track of
// which rows it touched. Called immediately before completeFinishedBookings
// within the same job tick - see bookingLifecycle.job.js.
exports.findBookingsCompletingToday = async () => {
    const [rows] = await db.query(
        `SELECT id, booking_reference, customer_id, provider_id
        FROM bookings
        WHERE status = 'active' AND payment_status = 'paid' AND end_date < CURDATE()`
    );
    return rows;
};

// Cancel: flip status to 'cancelled' (or 'refunded' - Phase 3, when the
// booking had already been paid for - see booking.service.js#cancelBooking)
// and give back every date's units, all in one transaction - the inverse
// of createBooking's decrement loop above.
exports.cancelBooking = async (bookingId, serviceId, dateItems, finalStatus = "cancelled") => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await connection.query(
            "UPDATE bookings SET status = ? WHERE id = ?",
            [finalStatus, bookingId]
        );

        // Phase RF3: was one restoreUnits UPDATE per date; now one
        // batched UPDATE covers every date in the booking's range.
        await availabilityRepository.restoreUnitsForDates(connection, serviceId, dateItems);

        await connection.commit();

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};
