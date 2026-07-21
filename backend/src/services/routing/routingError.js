// Thrown by a routing provider (osrm.provider.js, etc.) on any failure -
// network error, timeout, non-Ok OSRM response code, malformed response.
// routing.service.js catches this specifically to decide whether to fall
// back to the straight-line estimate; anything else (a programmer error,
// bad input) is left to propagate normally.
class RoutingProviderError extends Error {
    constructor(message, { provider, reason, cause } = {}) {
        super(message);
        this.name = "RoutingProviderError";
        this.provider = provider || "unknown";
        this.reason = reason || "unknown"; // "timeout" | "network" | "no_route" | "bad_response"
        if (cause) this.cause = cause;
    }
}

module.exports = { RoutingProviderError };
