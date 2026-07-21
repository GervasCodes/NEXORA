const fallbackProvider = require("../../../src/services/routing/providers/fallback.provider");
const { haversineKm } = require("../../../src/utils/geo");

describe("routing/providers/fallback.provider.getRoute", () => {
    const point = { originLat: -6.7924, originLng: 39.2083, destLat: -6.8, destLng: 39.29 };

    it("returns the haversine distance and an ETA-derived duration", async () => {
        const expectedDistance = haversineKm(point.originLat, point.originLng, point.destLat, point.destLng);

        const result = await fallbackProvider.getRoute({ ...point, vehicleType: "motorcycle" });

        expect(result.distanceKm).toBeCloseTo(expectedDistance, 6);
        expect(result.provider).toBe("fallback");
        expect(result.profile).toBeNull();
        expect(result.durationMinutes).toBeGreaterThan(0);
    });

    it("uses the default average speed when vehicleType is missing/unknown", async () => {
        const known = await fallbackProvider.getRoute({ ...point, vehicleType: "motorcycle" });
        const unknown = await fallbackProvider.getRoute({ ...point, vehicleType: "unknown_vehicle" });

        // motorcycle (32 km/h) is faster than the 25 km/h default, so its
        // duration for the same distance should be shorter.
        expect(known.durationMinutes).toBeLessThan(unknown.durationMinutes);
    });

    it("never throws, even for identical origin/destination", async () => {
        const same = { originLat: 1, originLng: 1, destLat: 1, destLng: 1 };
        const result = await fallbackProvider.getRoute(same);
        expect(result.distanceKm).toBe(0);
        expect(result.durationMinutes).toBe(0);
    });
});
