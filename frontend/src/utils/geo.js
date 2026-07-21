// Mirrors backend/src/utils/geo.js + eta.js. Kept client-side too so the
// widget/tracking page can recompute distance-remaining and ETA on every
// "agent:position" tick locally, without a round trip to the API - the
// backend copy is still the source of truth returned by GET /delivery/:id
// on first load and after any status change.

export const haversineKm = (lat1, lng1, lat2, lng2) => {
    if ([lat1, lng1, lat2, lng2].some((v) => v == null || Number.isNaN(Number(v)))) return null;

    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

const VEHICLE_AVERAGE_SPEED_KMH = {
    bicycle: 14,
    motorcycle: 32,
    tuktuk: 24,
    car: 28,
    van: 26,
    truck: 22
};
const DEFAULT_AVERAGE_SPEED_KMH = 25;

export const estimateEtaMinutes = (distanceKm, vehicleType) => {
    if (distanceKm == null || Number.isNaN(Number(distanceKm))) return null;

    const speedKmh = VEHICLE_AVERAGE_SPEED_KMH[vehicleType] || DEFAULT_AVERAGE_SPEED_KMH;
    const hours = Math.max(Number(distanceKm), 0) / speedKmh;

    return Math.max(Math.round(hours * 60), Number(distanceKm) > 0 ? 1 : 0);
};

// Bearing in degrees (0 = north, clockwise) from point A to point B - used
// to rotate the courier marker/icon so it visibly points the direction
// of travel instead of always facing the same way.
export const bearingDegrees = (lat1, lng1, lat2, lng2) => {
    if ([lat1, lng1, lat2, lng2].some((v) => v == null || Number.isNaN(Number(v)))) return null;

    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;

    const dLng = toRad(lng2 - lng1);
    const y = Math.sin(dLng) * Math.cos(toRad(lat2));
    const x =
        Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);

    return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

// 0-100 progress along the pickup -> destination line, based on how much
// of the *original* pickup-to-destination distance is left. Used by the
// floating widget's progress bar. Clamped so a straight-line shortcut
// (agent slightly off the direct line) never reads as >100% or <0%.
export const progressPercent = (totalKm, remainingKm) => {
    if (!totalKm || remainingKm == null) return null;
    const pct = ((totalKm - remainingKm) / totalKm) * 100;
    return Math.min(100, Math.max(0, Math.round(pct)));
};
