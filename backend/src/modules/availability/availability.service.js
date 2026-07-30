const availabilityRepository = require("./availability.repository");
const serviceRepository = require("../service/service.repository");
const { computeDynamicPrice } = require("../../utils/dynamicPricing");

// Inclusive date range -> array of "YYYY-MM-DD" strings. Kept deliberately
// simple (no timezone library) since every date here is a plain calendar
// date, never a timestamp - a booking's "check-in" is the same date
// worldwide, not an instant.
const dateRange = (startDate, endDate) => {
    const dates = [];
    const cursor = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);

    while (cursor <= end) {
        dates.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return dates;
};

exports.dateRange = dateRange;

// A provider sets availability for a date range in one call (e.g. "open
// 20 rooms at the base price for all of August") rather than one date at
// a time - CHANGES.md's Provider Dashboard lists "Calendar / Inventory /
// Pricing" as one Availability Management unit, and a real calendar UI
// will call this once per range selection, not once per day clicked.
exports.setAvailability = async (providerId, serviceId, { startDate, endDate, availableUnits, price, status }) => {
    const service = await serviceRepository.findById(serviceId);

    if (!service || service.provider_id !== providerId) {
        throw new Error("Service not found");
    }

    if (new Date(startDate) > new Date(endDate)) {
        throw new Error("Start date must be on or before the end date");
    }

    const dates = dateRange(startDate, endDate);

    for (const date of dates) {
        await availabilityRepository.upsertOne(
            serviceId,
            date,
            availableUnits,
            price ?? null,
            status || "open"
        );
    }

    return { datesUpdated: dates.length };
};

// Public: what a buyer's date picker (and booking.service.js, before
// creating a booking) sees for a service across a range. A date with no
// row at all is reported as unavailable rather than defaulting to "open
// with unlimited units" - a provider has to deliberately open a date
// (Availability Management) before it's bookable, the same way a
// product has to exist with stock > 0 before it can be ordered; there's
// no implicit inventory here.
exports.getAvailability = async (serviceId, startDate, endDate) => {
    const service = await serviceRepository.findById(serviceId);

    if (!service) {
        throw new Error("Service not found");
    }

    const rows = await availabilityRepository.findByServiceAndDateRange(serviceId, startDate, endDate);
    const byDate = new Map(rows.map((row) => [
        row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date,
        row
    ]));

    // Phase 5 (Growth) - same rule set + priority order
    // booking.service.js's priceDateItems uses at charge time, so the
    // calendar preview never shows a price different from what the
    // customer will actually be charged.
    const pricingRules = await serviceRepository.findActivePricingRulesByService(serviceId);
    const basePrice = Number(service.discount_price ?? service.base_price);

    return dateRange(startDate, endDate).map((date) => {
        const row = byDate.get(date);

        if (!row || row.status !== "open" || row.available_units <= 0) {
            return { date, available: false, availableUnits: row?.available_units ?? 0, price: null };
        }

        return {
            date,
            available: true,
            availableUnits: row.available_units,
            price: row.price !== null ? Number(row.price) : computeDynamicPrice(basePrice, pricingRules, date)
        };
    });
};
