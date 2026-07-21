const {
    VEHICLE_AVERAGE_SPEED_KMH,
    DEFAULT_AVERAGE_SPEED_KMH
} = require("../constants/orderStatus");

// Turns a straight-line distance into a rough travel time, using a
// per-vehicle average city-traffic speed (see orderStatus.js). This is
// intentionally simple - it's what powers the tracking widget/page ETA
// today. Phase 5 (road routing) swaps the *distance* input for a real
// OSRM road distance/duration and this becomes the fallback used only
// when OSRM can't be reached, so the signature (distanceKm in, minutes
// out) is kept stable on purpose.
exports.estimateEtaMinutes = (distanceKm, vehicleType) => {
    if (distanceKm == null || Number.isNaN(Number(distanceKm))) return null;

    const speedKmh = VEHICLE_AVERAGE_SPEED_KMH[vehicleType] || DEFAULT_AVERAGE_SPEED_KMH;
    const hours = Math.max(Number(distanceKm), 0) / speedKmh;

    // Always at least 1 minute once there's any distance at all - "0 min"
    // reads as "already here" which isn't true for e.g. a 200m gap.
    return Math.max(Math.round(hours * 60), Number(distanceKm) > 0 ? 1 : 0);
};
