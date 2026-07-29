const db = require("../../config/db");

// Upsert one date's availability row. Called once per date in a
// provider's chosen range (availability.service.js#setAvailability
// expands the range into individual dates before calling this) - a
// single multi-row bulk statement would be marginally faster, but this
// keeps each date's ON DUPLICATE KEY UPDATE simple and readable, and a
// provider setting availability is not a hot path the way checking it
// is.
exports.upsertOne = async (serviceId, date, availableUnits, price, status) => {
    await db.query(
        `INSERT INTO service_availability (service_id, date, available_units, price, status)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            available_units = VALUES(available_units),
            price = VALUES(price),
            status = VALUES(status)`,
        [serviceId, date, availableUnits, price, status]
    );
};

exports.findByServiceAndDateRange = async (serviceId, startDate, endDate) => {
    const [rows] = await db.query(
        `SELECT date, available_units, price, status
        FROM service_availability
        WHERE service_id = ? AND date >= ? AND date <= ?
        ORDER BY date ASC`,
        [serviceId, startDate, endDate]
    );
    return rows;
};

exports.findByServiceAndDate = async (serviceId, date, connection = db) => {
    const [rows] = await connection.query(
        "SELECT * FROM service_availability WHERE service_id = ? AND date = ?",
        [serviceId, date]
    );
    return rows[0];
};

// Same guarded-decrement pattern order.repository.js#insertOrderItems
// uses for product stock: the WHERE clause re-checks available_units
// >= quantity in the same statement, so a concurrent booking on the
// same date can't both succeed and oversell the date. affectedRows === 0
// means "someone else took the remaining units first" - the caller
// (booking.repository.js, inside its own transaction) treats that as a
// failure and rolls back.
exports.decrementUnits = async (connection, serviceId, date, quantity) => {
    const [result] = await connection.query(
        `UPDATE service_availability
        SET available_units = available_units - ?
        WHERE service_id = ? AND date = ? AND status = 'open' AND available_units >= ?`,
        [quantity, serviceId, date, quantity]
    );
    return result.affectedRows > 0;
};

// Reverses decrementUnits - used when a booking is cancelled, to give
// the units back for that date.
exports.restoreUnits = async (connection, serviceId, date, quantity) => {
    await connection.query(
        `UPDATE service_availability
        SET available_units = available_units + ?
        WHERE service_id = ? AND date = ?`,
        [quantity, serviceId, date]
    );
};
