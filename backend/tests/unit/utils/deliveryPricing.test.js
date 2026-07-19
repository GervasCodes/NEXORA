const {
    DEFAULT_BANDS,
    isValidBandsConfig,
    parseBandsConfig,
    computeBandedFee
} = require("../../../src/utils/deliveryPricing");

describe("deliveryPricing.isValidBandsConfig", () => {
    it("accepts a well-formed bands config", () => {
        expect(isValidBandsConfig(DEFAULT_BANDS)).toBe(true);
    });

    it("rejects a missing/non-array bands field", () => {
        expect(isValidBandsConfig(null)).toBe(false);
        expect(isValidBandsConfig({})).toBe(false);
        expect(isValidBandsConfig({ bands: "nope" })).toBe(false);
        expect(isValidBandsConfig({ bands: [] })).toBe(false);
    });

    it("rejects a band with a non-numeric or non-positive up_to_km", () => {
        expect(isValidBandsConfig({ bands: [{ up_to_km: 0, fee: 100 }] })).toBe(false);
        expect(isValidBandsConfig({ bands: [{ up_to_km: "3", fee: 100 }] })).toBe(false);
    });

    it("rejects a band with a negative fee", () => {
        expect(isValidBandsConfig({ bands: [{ up_to_km: 3, fee: -1 }] })).toBe(false);
    });
});

describe("deliveryPricing.parseBandsConfig", () => {
    it("parses a valid JSON string config", () => {
        const raw = JSON.stringify({ bands: [{ up_to_km: 5, fee: 1000 }], per_km_beyond: 300 });
        expect(parseBandsConfig(raw)).toEqual({ bands: [{ up_to_km: 5, fee: 1000 }], per_km_beyond: 300 });
    });

    it("falls back to DEFAULT_BANDS on malformed JSON", () => {
        expect(parseBandsConfig("{not json")).toEqual(DEFAULT_BANDS);
    });

    it("falls back to DEFAULT_BANDS when the parsed shape is invalid", () => {
        expect(parseBandsConfig(JSON.stringify({ bands: [] }))).toEqual(DEFAULT_BANDS);
    });

    it("defaults per_km_beyond to 0 when missing/negative", () => {
        const raw = { bands: [{ up_to_km: 5, fee: 1000 }] };
        expect(parseBandsConfig(raw).per_km_beyond).toBe(0);

        const negative = { bands: [{ up_to_km: 5, fee: 1000 }], per_km_beyond: -5 };
        expect(parseBandsConfig(negative).per_km_beyond).toBe(0);
    });

    it("accepts an already-parsed object (not just a JSON string)", () => {
        expect(parseBandsConfig(DEFAULT_BANDS)).toEqual(DEFAULT_BANDS);
    });
});

describe("deliveryPricing.computeBandedFee", () => {
    it("charges the flat fee of the first band a distance fits under", () => {
        expect(computeBandedFee(2, DEFAULT_BANDS)).toBe(2000);
        expect(computeBandedFee(3, DEFAULT_BANDS)).toBe(2000); // boundary is inclusive
        expect(computeBandedFee(3.01, DEFAULT_BANDS)).toBe(4000);
        expect(computeBandedFee(7, DEFAULT_BANDS)).toBe(4000);
    });

    it("charges the last band's fee plus per-km-beyond past the final band", () => {
        // last band: up_to_km 20, fee 9000; per_km_beyond 600
        expect(computeBandedFee(25, DEFAULT_BANDS)).toBe(9000 + 5 * 600);
    });

    it("sorts unsorted bands defensively before evaluating", () => {
        const unsorted = {
            bands: [
                { up_to_km: 12, fee: 6000 },
                { up_to_km: 3, fee: 2000 },
                { up_to_km: 7, fee: 4000 }
            ],
            per_km_beyond: 0
        };
        expect(computeBandedFee(5, unsorted)).toBe(4000);
    });

    it("returns the fallback fee when the config is invalid", () => {
        expect(computeBandedFee(5, null, 1234)).toBe(1234);
        expect(computeBandedFee(5, { bands: [] }, 1234)).toBe(1234);
    });

    it("rounds the beyond-last-band charge to the nearest integer", () => {
        const config = { bands: [{ up_to_km: 1, fee: 100 }], per_km_beyond: 333 };
        // 1km beyond band + 0.5km extra => 100 + 0.5*333 = 266.5 -> rounds to 267 (Math.round)
        expect(computeBandedFee(1.5, config)).toBe(Math.round(100 + 0.5 * 333));
    });
});
