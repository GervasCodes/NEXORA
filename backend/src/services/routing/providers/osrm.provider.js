const routingConfig = require("../../../config/routing");
const { RoutingProviderError } = require("../routingError");

// OSRM has no dedicated profile for motorcycle/tuktuk/van - "driving"
// is the closest real-road-network approximation for all motorized
// vehicles. "bicycle" maps to OSRM's "cycling" profile so pedal-powered
// agents get cycle-appropriate routing (one-ways, cycle paths) rather
// than a car route. Anything unrecognized falls back to the configured
// default profile (see config/routing.js).
const VEHICLE_TO_OSRM_PROFILE = {
    bicycle: "cycling",
    motorcycle: "driving",
    tuktuk: "driving",
    car: "driving",
    van: "driving"
};

const resolveProfile = (vehicleType) =>
    VEHICLE_TO_OSRM_PROFILE[vehicleType] || routingConfig.osrm.defaultProfile;

const buildRouteUrl = (originLat, originLng, destLat, destLng, profile) => {
    // OSRM takes coordinates as lng,lat (not lat,lng) - easy to get
    // backwards, hence the explicit param names throughout this file.
    const coords = `${originLng},${originLat};${destLng},${destLat}`;
    return `${routingConfig.osrm.baseUrl}/route/v1/${profile}/${coords}?overview=false&alternatives=false&steps=false`;
};

// Fetches a single origin -> destination road route from OSRM.
// Returns { distanceKm, durationMinutes, provider: "osrm", profile }.
// Throws RoutingProviderError on any failure - network error, timeout,
// non-"Ok" OSRM response code (e.g. "NoRoute" when the two points aren't
// connected by any mapped road), or a malformed response body. Callers
// (routing.service.js) decide what to do with that - this module only
// ever talks to OSRM and reports what happened.
exports.getRoute = async ({ originLat, originLng, destLat, destLng, vehicleType }) => {
    const profile = resolveProfile(vehicleType);
    const url = buildRouteUrl(originLat, originLng, destLat, destLng, profile);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), routingConfig.osrm.timeoutMs);

    let response;
    try {
        response = await fetch(url, { signal: controller.signal });
    } catch (error) {
        const reason = error.name === "AbortError" ? "timeout" : "network";
        throw new RoutingProviderError(`OSRM request failed (${reason})`, {
            provider: "osrm",
            reason,
            cause: error
        });
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        throw new RoutingProviderError(`OSRM responded with HTTP ${response.status}`, {
            provider: "osrm",
            reason: "bad_response"
        });
    }

    let body;
    try {
        body = await response.json();
    } catch (error) {
        throw new RoutingProviderError("OSRM returned a non-JSON response", {
            provider: "osrm",
            reason: "bad_response",
            cause: error
        });
    }

    if (body.code !== "Ok" || !Array.isArray(body.routes) || body.routes.length === 0) {
        // "NoRoute" (points not reachable on the road network), "InvalidUrl",
        // "InvalidQuery" etc all land here - none of them are worth
        // distinguishing further up, they all just mean "no usable route".
        throw new RoutingProviderError(`OSRM returned no route (${body.code || "unknown"})`, {
            provider: "osrm",
            reason: "no_route"
        });
    }

    const [route] = body.routes;

    if (typeof route.distance !== "number" || typeof route.duration !== "number") {
        throw new RoutingProviderError("OSRM route was missing distance/duration", {
            provider: "osrm",
            reason: "bad_response"
        });
    }

    return {
        distanceKm: route.distance / 1000,
        durationMinutes: route.duration / 60,
        provider: "osrm",
        profile
    };
};

exports.resolveProfile = resolveProfile;
