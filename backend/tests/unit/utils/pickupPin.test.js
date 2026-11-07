const { isValidTanzaniaPin, hasUsablePin, assertSellerHasPin, isVerifiedAccuracy } = require("../../../src/utils/pickupPin");
const { addDaysInTz } = require("../../../src/utils/dateTz");
const { dropoffFit } = require("../../../src/modules/delivery/agentScoring");

describe("pickupPin", () => {
    it("accepts Dar es Salaam and rejects (0,0) and foreign coordinates", () => {
        expect(isValidTanzaniaPin(-6.8, 39.2)).toBe(true);
        expect(isValidTanzaniaPin(0, 0)).toBe(false);
        expect(isValidTanzaniaPin(51.5, -0.1)).toBe(false);
    });
    it("treats a seller without a pin as unusable and throws a 409", () => {
        expect(hasUsablePin({ pickup_lat: null, pickup_lng: null })).toBe(false);
        expect(() => assertSellerHasPin({})).toThrow(/store location/i);
        try { assertSellerHasPin(undefined); } catch (e) { expect(e.status).toBe(409); expect(e.code).toBe("PICKUP_PIN_REQUIRED"); }
        expect(() => assertSellerHasPin({ pickup_lat: -6.8, pickup_lng: 39.2 })).not.toThrow();
    });
    it("verifies only GPS accuracy of 100 m or better", () => {
        expect(isVerifiedAccuracy(40)).toBe(true);
        expect(isVerifiedAccuracy(250)).toBe(false);
    });
});

describe("dateTz.addDaysInTz", () => {
    it("adds days in Dar es Salaam time across a UTC date boundary", () => {
        // 22:30 UTC is already the next day (01:30) in Dar es Salaam.
        const now = new Date("2026-10-25T22:30:00Z");
        expect(addDaysInTz(0, now, "Africa/Dar_es_Salaam")).toBe("2026-10-26");
        expect(addDaysInTz(3, now, "Africa/Dar_es_Salaam")).toBe("2026-10-29");
    });
});

describe("agentScoring.dropoffFit", () => {
    it("scores a driver already near the drop-off higher than one far away", () => {
        const near = dropoffFit({ agentToPickupKm: 2, pickupToDropKm: 8, agentToDropKm: 3 });
        const far = dropoffFit({ agentToPickupKm: 2, pickupToDropKm: 8, agentToDropKm: 19 });
        expect(near).toBeGreaterThan(far);
        expect(near).toBeLessThanOrEqual(1);
        expect(far).toBeGreaterThanOrEqual(0);
    });
});
