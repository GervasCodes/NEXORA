jest.mock("../../../src/config/routing", () => ({
    provider: "osrm",
    fallbackEnabled: true,
    osrm: { baseUrl: "https://router.example.test", defaultProfile: "driving", timeoutMs: 5000 }
}));
jest.mock("../../../src/services/routing/providers/osrm.provider");
jest.mock("../../../src/services/routing/providers/fallback.provider");

const routingConfig = require("../../../src/config/routing");
const osrmProvider = require("../../../src/services/routing/providers/osrm.provider");
const fallbackProvider = require("../../../src/services/routing/providers/fallback.provider");
const routingService = require("../../../src/services/routing/routing.service");
const { RoutingProviderError } = require("../../../src/services/routing/routingError");

const point = { originLat: -6.7924, originLng: 39.2083, destLat: -6.8, destLng: 39.29 };

beforeEach(() => {
    routingConfig.provider = "osrm";
    routingConfig.fallbackEnabled = true;
});

describe("routing.service.getRoute - input validation", () => {
    it("rejects a call missing coordinates without touching any provider", async () => {
        await expect(routingService.getRoute({ originLat: -6.7924 })).rejects.toBeInstanceOf(
            RoutingProviderError
        );
        expect(osrmProvider.getRoute).not.toHaveBeenCalled();
        expect(fallbackProvider.getRoute).not.toHaveBeenCalled();
    });

    it("rejects non-numeric coordinates", async () => {
        await expect(
            routingService.getRoute({ ...point, originLat: "not-a-number" })
        ).rejects.toBeInstanceOf(RoutingProviderError);
    });
});

describe("routing.service.getRoute - happy path (osrm primary)", () => {
    it("returns the osrm provider's result with degraded: false", async () => {
        osrmProvider.getRoute.mockResolvedValue({
            distanceKm: 12.3,
            durationMinutes: 18,
            provider: "osrm",
            profile: "driving"
        });

        const result = await routingService.getRoute(point);

        expect(result).toEqual({
            distanceKm: 12.3,
            durationMinutes: 18,
            provider: "osrm",
            profile: "driving",
            degraded: false
        });
        expect(fallbackProvider.getRoute).not.toHaveBeenCalled();
    });

    it("passes vehicleType through to the provider", async () => {
        osrmProvider.getRoute.mockResolvedValue({
            distanceKm: 1, durationMinutes: 1, provider: "osrm", profile: "cycling"
        });

        await routingService.getRoute({ ...point, vehicleType: "bicycle" });

        expect(osrmProvider.getRoute).toHaveBeenCalledWith(
            expect.objectContaining({ vehicleType: "bicycle" })
        );
    });
});

describe("routing.service.getRoute - fallback behavior", () => {
    it("falls back to the straight-line provider when osrm throws and fallback is enabled", async () => {
        osrmProvider.getRoute.mockRejectedValue(
            new RoutingProviderError("OSRM timed out", { provider: "osrm", reason: "timeout" })
        );
        fallbackProvider.getRoute.mockResolvedValue({
            distanceKm: 9.9,
            durationMinutes: 24,
            provider: "fallback",
            profile: null
        });

        const result = await routingService.getRoute(point);

        expect(result).toEqual({
            distanceKm: 9.9,
            durationMinutes: 24,
            provider: "fallback",
            profile: null,
            degraded: true
        });
    });

    it("propagates the original error when osrm fails and fallback is disabled", async () => {
        routingConfig.fallbackEnabled = false;
        const failure = new RoutingProviderError("OSRM down", { provider: "osrm", reason: "network" });
        osrmProvider.getRoute.mockRejectedValue(failure);

        await expect(routingService.getRoute(point)).rejects.toBe(failure);
        expect(fallbackProvider.getRoute).not.toHaveBeenCalled();
    });

    it("re-throws a non-RoutingProviderError from the primary provider unchanged", async () => {
        const bug = new TypeError("unexpected");
        osrmProvider.getRoute.mockRejectedValue(bug);

        await expect(routingService.getRoute(point)).rejects.toBe(bug);
        expect(fallbackProvider.getRoute).not.toHaveBeenCalled();
    });

    it("uses the fallback provider directly (degraded: false) when it's configured as primary", async () => {
        routingConfig.provider = "fallback";
        fallbackProvider.getRoute.mockResolvedValue({
            distanceKm: 5, durationMinutes: 12, provider: "fallback", profile: null
        });

        const result = await routingService.getRoute(point);

        expect(result.degraded).toBe(false);
        expect(osrmProvider.getRoute).not.toHaveBeenCalled();
    });
});
