require("dotenv").config();

// Config for the routing abstraction layer (backend/src/services/routing).
// Every value has a sane default so the app runs unmodified with no new
// .env values set at all - OSRM's free public demo server as the primary
// provider, straight-line fallback if it's slow/unreachable. Override any
// of this in .env for a self-hosted OSRM instance or to change behavior.
//
// See docs/ROUTING.md for the full picture (provider selection, fallback
// behavior, and how this plugs into Phase 5B/5C/5D).

const toInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toBool = (value, fallback) => {
    if (value == null || value === "") return fallback;
    return value === "true";
};

module.exports = {
    // "osrm" (default) or "fallback" - forcing "fallback" disables OSRM
    // entirely (useful for offline dev/tests, or if you haven't stood up
    // an OSRM instance yet and want the straight-line estimate on purpose
    // rather than failing every request into it first).
    provider: process.env.ROUTING_PROVIDER || "osrm",

    osrm: {
        // Defaults to OSRM's public demo server - fine for development
        // and low volume, but it's rate-limited and has no uptime SLA.
        // Point this at a self-hosted OSRM instance for production (see
        // docs/ROUTING.md for a docker-compose example).
        baseUrl: (process.env.OSRM_BASE_URL || "https://router.project-osrm.org").replace(/\/+$/, ""),

        // OSRM routing profile. "driving" covers car/van/motorcycle/tuktuk
        // (OSRM ships driving/walking/cycling only - there's no dedicated
        // motorcycle/tuktuk profile - see mapVehicleToProfile below).
        defaultProfile: process.env.OSRM_PROFILE || "driving",

        timeoutMs: toInt(process.env.OSRM_TIMEOUT_MS, 5000)
    },

    // If the primary provider errors, times out, or returns "no route
    // found", fall back to the haversine-distance + average-speed estimate
    // (utils/geo.js + utils/eta.js) instead of failing the request. Set to
    // "false" to surface routing failures instead - e.g. if you'd rather
    // an operation visibly fail than silently degrade to a rough estimate.
    fallbackEnabled: toBool(process.env.ROUTING_FALLBACK_ENABLED, true)
};
