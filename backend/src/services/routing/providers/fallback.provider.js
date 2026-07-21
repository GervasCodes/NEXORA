const { haversineKm } = require("../../../utils/geo");
const { estimateEtaMinutes } = require("../../../utils/eta");

// Same shape as osrm.provider.js's getRoute, backed by the pre-Phase-5
// straight-line math (utils/geo.js + utils/eta.js) instead of a real road
// network. Used by routing.service.js whenever the primary provider is
// unavailable, disabled, or fails and fallback is enabled - this is what
// every distance/ETA call in the app already effectively did before
// Phase 5, so it's a safe, always-available default that never makes a
// network call and never throws.
exports.getRoute = async ({ originLat, originLng, destLat, destLng, vehicleType }) => {
    const distanceKm = haversineKm(
        Number(originLat), Number(originLng),
        Number(destLat), Number(destLng)
    );

    return {
        distanceKm,
        durationMinutes: estimateEtaMinutes(distanceKm, vehicleType),
        provider: "fallback",
        profile: null
    };
};
