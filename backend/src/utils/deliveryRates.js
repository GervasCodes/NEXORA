// Pure helpers for Tanzanian transport-rate delivery pay. No DB access here -
// modules/delivery/deliveryRates.service.js loads the rows and calls these.
//
// Rider pay = max(min_fee, per_km_rate x distance_km) x fuel_factor, rounded
// to the nearest 100 TZS.
// fuel_factor = 1 + pass_through x (cap / baseline_cap - 1), where `cap` is the
// current EWURA litre price after the monthly-change guardrail.

const ROUND_TO = 100;
const TIME_ZONE = "Africa/Dar_es_Salaam";

// Agent vehicle enum (users.vehicle_type) -> rate card vehicle key.
// Anything not listed (bicycle, unknown) falls back to the default vehicle.
const VEHICLE_TO_RATE_KEY = {
    motorcycle: "boda",
    tuktuk: "bajaj",
    car: "car",
    van: "car",
    truck: "car"
};

exports.resolveRateVehicle = (vehicleType, defaultVehicle) => {
    if (!vehicleType) return defaultVehicle;
    if (Object.values(VEHICLE_TO_RATE_KEY).includes(vehicleType)) return vehicleType;
    return VEHICLE_TO_RATE_KEY[vehicleType] || defaultVehicle;
};

exports.roundToNearest = (amount, step = ROUND_TO) => Math.round(Number(amount) / step) * step;

// Keeps this month's cap within +/- maxChangePct of the previous month's.
// Returns the cap actually used and whether it had to be limited.
exports.applyMonthlyChangeGuardrail = (cap, previousCap, maxChangePct) => {
    const current = Number(cap);
    const previous = Number(previousCap);
    const max = Number(maxChangePct);

    if (!Number.isFinite(current) || !(previous > 0) || !Number.isFinite(max) || max < 0) {
        return { cap: current, limited: false };
    }

    const floor = previous * (1 - max / 100);
    const ceiling = previous * (1 + max / 100);
    const bounded = Math.min(ceiling, Math.max(floor, current));

    return { cap: Number(bounded.toFixed(2)), limited: bounded !== current };
};

exports.computeFuelFactor = ({ cap, baselineCap, passThroughPct }) => {
    const c = Number(cap);
    const base = Number(baselineCap);
    const pass = Number(passThroughPct) / 100;

    if (!(c > 0) || !(base > 0) || !Number.isFinite(pass)) return 1;

    return Number((1 + pass * (c / base - 1)).toFixed(4));
};

exports.computeRateFee = ({ card, distanceKm, fuelFactor = 1 }) => {
    const raw = Math.max(Number(card.min_fee), Number(card.per_km_rate) * Number(distanceKm));
    return exports.roundToNearest(raw * fuelFactor);
};

// Hour of day (0-23) in Dar es Salaam for any Date.
exports.localHour = (date = new Date()) => {
    const hour = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TIME_ZONE }).format(date);
    return Number(hour);
};

const hourInWindow = (hour, start, end) => (start <= end ? hour >= start && hour < end : hour >= start || hour < end);

// Applies every active window that covers `hour`: multipliers multiply,
// buffers add. `handlingBufferMinutes` is a flat extra for pickup handling.
exports.adjustDuration = ({ durationMinutes, adjustments = [], hour, handlingBufferMinutes = 0 }) => {
    if (durationMinutes == null) return null;

    let multiplier = 1;
    let buffer = Number(handlingBufferMinutes) || 0;

    for (const row of adjustments) {
        if (row.is_active === 0 || row.is_active === false) continue;
        if (hourInWindow(hour, Number(row.start_hour), Number(row.end_hour))) {
            multiplier *= Number(row.multiplier) || 1;
            buffer += Number(row.buffer_minutes) || 0;
        }
    }

    return Math.max(1, Math.round(Number(durationMinutes) * multiplier + buffer));
};
