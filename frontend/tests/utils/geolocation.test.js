import { describe, it, expect, vi, afterEach } from "vitest";
import { composeAddressWithLandmark, getPositionOnce } from "../../src/utils/geolocation";

const original = Object.getOwnPropertyDescriptor(navigator, "geolocation");
const setGeo = (value) => Object.defineProperty(navigator, "geolocation", { value, configurable: true });

afterEach(() => {
    if (original) Object.defineProperty(navigator, "geolocation", original);
    else delete navigator.geolocation;
});

describe("getPositionOnce", () => {
    it("resolves lat/lng/accuracy from a single getCurrentPosition call", async () => {
        const geo = { getCurrentPosition: vi.fn((ok) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 5 } })), watchPosition: vi.fn() };
        setGeo(geo);
        await expect(getPositionOnce()).resolves.toEqual({ lat: 1, lng: 2, accuracy: 5 });
        expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
        expect(geo.watchPosition).not.toHaveBeenCalled();
    });

    it.each([[1, "denied"], [2, "unavailable"], [3, "timeout"], [99, "unavailable"]])(
        "maps geolocation error code %s to '%s'",
        async (code, reason) => {
            setGeo({ getCurrentPosition: (_ok, fail) => fail({ code, message: "x" }) });
            await expect(getPositionOnce()).rejects.toMatchObject({ code: reason });
        }
    );

    it("rejects as 'unsupported' when the browser has no geolocation", async () => {
        setGeo(undefined);
        await expect(getPositionOnce()).rejects.toMatchObject({ code: "unsupported" });
    });
});

describe("composeAddressWithLandmark", () => {
    it("returns the address alone when there is no landmark", () => {
        expect(composeAddressWithLandmark("12 Kinondoni Rd", "  ")).toBe("12 Kinondoni Rd");
    });

    it("appends the landmark using the given label", () => {
        expect(composeAddressWithLandmark("12 Kinondoni Rd", "Shell petrol", "Karibu na"))
            .toBe("12 Kinondoni Rd - Karibu na: Shell petrol");
    });

    it("never exceeds the 255-character column, trimming the landmark first", () => {
        const result = composeAddressWithLandmark("A".repeat(200), "L".repeat(100));
        expect(result.length).toBeLessThanOrEqual(255);
        expect(result.startsWith("A".repeat(200))).toBe(true);
    });

    it("drops the landmark rather than truncating the address when there is no room", () => {
        const base = "A".repeat(250);
        expect(composeAddressWithLandmark(base, "Shell")).toBe(base);
    });
});
