const { estimateEtaMinutes } = require("../../../src/utils/eta");

describe("utils/eta.estimateEtaMinutes", () => {
    it("returns null when distance is missing", () => {
        expect(estimateEtaMinutes(null, "motorcycle")).toBeNull();
        expect(estimateEtaMinutes(undefined, "motorcycle")).toBeNull();
    });

    it("returns null when distance isn't a valid number", () => {
        expect(estimateEtaMinutes("not-a-number", "motorcycle")).toBeNull();
    });

    it("returns 0 minutes for a zero-distance gap", () => {
        expect(estimateEtaMinutes(0, "motorcycle")).toBe(0);
    });

    it("uses the per-vehicle average speed", () => {
        // 32 km/h motorcycle: 16km -> 30 minutes exactly
        expect(estimateEtaMinutes(16, "motorcycle")).toBe(30);
    });

    it("falls back to the default speed for an unknown/missing vehicle type", () => {
        // 25 km/h default: 10km -> 24 minutes
        expect(estimateEtaMinutes(10, "hot_air_balloon")).toBe(24);
        expect(estimateEtaMinutes(10, undefined)).toBe(24);
    });

    it("never returns 0 minutes for a non-zero distance, even a tiny one", () => {
        expect(estimateEtaMinutes(0.01, "motorcycle")).toBe(1);
    });

    it("treats a negative distance as zero rather than a negative ETA", () => {
        expect(estimateEtaMinutes(-5, "car")).toBe(0);
    });
});
