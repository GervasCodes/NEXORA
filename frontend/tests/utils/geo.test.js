import { describe, it, expect } from "vitest";
import { haversineKm, estimateEtaMinutes, bearingDegrees, progressPercent } from "../../src/utils/geo";

describe("geo.haversineKm", () => {
    it("returns 0 for identical points", () => {
        expect(haversineKm(-6.8, 39.2, -6.8, 39.2)).toBeCloseTo(0, 5);
    });

    it("returns a sensible distance for two known Dar es Salaam points", () => {
        // Roughly 1.5km apart
        const km = haversineKm(-6.80, 39.20, -6.81, 39.21);
        expect(km).toBeGreaterThan(1);
        expect(km).toBeLessThan(2);
    });

    it("returns null when any coordinate is missing", () => {
        expect(haversineKm(null, 39.2, -6.8, 39.2)).toBeNull();
        expect(haversineKm(-6.8, undefined, -6.8, 39.2)).toBeNull();
    });
});

describe("geo.estimateEtaMinutes", () => {
    it("returns null when distance is missing", () => {
        expect(estimateEtaMinutes(null, "car")).toBeNull();
    });

    it("scales inversely with vehicle speed", () => {
        const bicycleEta = estimateEtaMinutes(10, "bicycle");
        const motorcycleEta = estimateEtaMinutes(10, "motorcycle");
        expect(bicycleEta).toBeGreaterThan(motorcycleEta);
    });

    it("never returns 0 for a non-zero distance", () => {
        expect(estimateEtaMinutes(0.05, "motorcycle")).toBeGreaterThanOrEqual(1);
    });
});

describe("geo.bearingDegrees", () => {
    it("returns a value between 0 and 360", () => {
        const bearing = bearingDegrees(-6.80, 39.20, -6.79, 39.21);
        expect(bearing).toBeGreaterThanOrEqual(0);
        expect(bearing).toBeLessThan(360);
    });

    it("returns null when a coordinate is missing", () => {
        expect(bearingDegrees(null, 39.2, -6.8, 39.2)).toBeNull();
    });

    it("points roughly north (~0deg) when moving to a higher latitude only", () => {
        const bearing = bearingDegrees(-6.80, 39.20, -6.70, 39.20);
        expect(bearing).toBeLessThan(5);
    });
});

describe("geo.progressPercent", () => {
    it("returns null without a total distance", () => {
        expect(progressPercent(0, 5)).toBeNull();
        expect(progressPercent(null, 5)).toBeNull();
    });

    it("returns null without a remaining distance", () => {
        expect(progressPercent(10, null)).toBeNull();
    });

    it("computes the percentage of the route already covered", () => {
        expect(progressPercent(10, 5)).toBe(50);
        expect(progressPercent(10, 0)).toBe(100);
        expect(progressPercent(10, 10)).toBe(0);
    });

    it("clamps to 0-100 even if remaining briefly exceeds total (off-route wobble)", () => {
        expect(progressPercent(10, 12)).toBe(0);
        expect(progressPercent(10, -2)).toBe(100);
    });
});
