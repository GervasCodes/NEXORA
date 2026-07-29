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

        for (const item of dateItems) {
            const decremented = await availabilityRepository.decrementUnits(
                connection, serviceId, item.date, quantity
            );

            if (!decremented) {
                throw Object.assign(
                    new Error(`No longer enough availability on ${item.date}`),
                    { code: "AVAILABILITY_UNAVAILABLE" }
                );
            }

            await connection.query(
                `INSERT INTO booking_items (booking_id, service_date, quantity, unit_price, subtotal)
                VALUES (?, ?, ?, ?, ?)`,
                [bookingId, item.date, quantity, item.unitPrice, item.subtotal]
            );
        }

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

        for (const item of dateItems) {
            await availabilityRepository.restoreUnits(connection, serviceId, item.service_date, item.quantity);
        }

        await connection.commit();

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};
