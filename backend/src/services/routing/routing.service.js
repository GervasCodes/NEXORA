const routingConfig = require("../../config/routing");
const osrmProvider = require("./providers/osrm.provider");
const fallbackProvider = require("./providers/fallback.provider");
const { RoutingProviderError } = require("./routingError");

const PROVIDERS = {
    osrm: osrmProvider,
    fallback: fallbackProvider
};

const hasCoordinate = (value) => value != null && Number.isFinite(Number(value));

// Routing abstraction layer (Phase 5A). This is the one place the rest of
// the app should go through for "how far / how long between these two
// points" - it doesn't yet replace any of the app's existing straight-line
// calls (that's Phase 5B/5C/5D, one call site at a time); it exists first
// as a standalone, independently testable module with its own config and
// fallback behavior.
//
// Returns:
//   {
//     distanceKm: number,
//     durationMinutes: number,
//     provider: "osrm" | "fallback",   // which provider actually answered
//     degraded: boolean                 // true if this is a fallback result,
//                                        // whether by config or because osrm failed
//   }
//
// Throws RoutingProviderError if the primary provider fails AND fallback
// is disabled (routingConfig.fallbackEnabled === false), or if the
// coordinates given are unusable. Never throws for "OSRM is down" when
// fallback is enabled (the default) - callers can rely on always getting
// a usable distance/duration back in that case, just possibly a rougher
// one.
exports.getRoute = async ({ originLat, originLng, destLat, destLng, vehicleType } = {}) => {
    if (![originLat, originLng, destLat, destLng].every(hasCoordinate)) {
        throw new RoutingProviderError("getRoute requires four numeric coordinates", {
            provider: "routing.service",
            reason: "bad_response"
        });
    }

    const params = {
        originLat: Number(originLat),
        originLng: Number(originLng),
        destLat: Number(destLat),
        destLng: Number(destLng),
        vehicleType
    };

    const primaryName = routingConfig.provider === "fallback" ? "fallback" : "osrm";
    const primary = PROVIDERS[primaryName];

    if (primaryName === "fallback") {
        // Fallback picked as the *primary* provider (ROUTING_PROVIDER=fallback)
        // is a deliberate config choice, not a degraded state - don't flag it
        // as such.
        const result = await primary.getRoute(params);
        return { ...result, degraded: false };
    }

    try {
        const result = await primary.getRoute(params);
        return { ...result, degraded: false };
    } catch (error) {
        if (!(error instanceof RoutingProviderError)) throw error;

        if (!routingConfig.fallbackEnabled) {
            throw error;
        }

        console.error(
            `[routing] ${primaryName} provider failed (${error.reason}): ${error.message} - falling back to straight-line estimate`
        );

        const result = await fallbackProvider.getRoute(params);
        return { ...result, degraded: true };
    }
};

exports.RoutingProviderError = RoutingProviderError;
