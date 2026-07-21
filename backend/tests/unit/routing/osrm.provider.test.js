const osrmProvider = require("../../../src/services/routing/providers/osrm.provider");
const { RoutingProviderError } = require("../../../src/services/routing/routingError");

const point = { originLat: -6.7924, originLng: 39.2083, destLat: -6.8, destLng: 39.29 };

const okResponse = (overrides = {}) => ({
    code: "Ok",
    routes: [{ distance: 15000, duration: 1200, ...overrides }]
});

describe("routing/providers/osrm.provider.getRoute", () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it("returns distanceKm/durationMinutes converted from OSRM's meters/seconds", async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => okResponse()
        });

        const result = await osrmProvider.getRoute(point);

        expect(result).toEqual({
            distanceKm: 15,
            durationMinutes: 20,
            provider: "osrm",
            profile: "driving"
        });
    });

    it("builds the OSRM URL with lng,lat order (not lat,lng)", async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => okResponse() });

        await osrmProvider.getRoute(point);

        const calledUrl = global.fetch.mock.calls[0][0];
        expect(calledUrl).toContain(`${point.originLng},${point.originLat}`);
        expect(calledUrl).toContain(`${point.destLng},${point.destLat}`);
    });

    it("maps a bicycle vehicleType to OSRM's cycling profile", async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => okResponse() });

        const result = await osrmProvider.getRoute({ ...point, vehicleType: "bicycle" });

        expect(result.profile).toBe("cycling");
        expect(global.fetch.mock.calls[0][0]).toContain("/route/v1/cycling/");
    });

    it("maps a motorcycle/tuktuk/van/car/unknown vehicleType to driving", async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => okResponse() });

        for (const vehicleType of ["motorcycle", "tuktuk", "van", "car", "spaceship", undefined]) {
            global.fetch.mockClear();
            const result = await osrmProvider.getRoute({ ...point, vehicleType });
            expect(result.profile).toBe("driving");
        }
    });

    it("throws a RoutingProviderError with reason 'timeout' when the request aborts", async () => {
        global.fetch = jest.fn().mockImplementation(() => {
            const error = new Error("aborted");
            error.name = "AbortError";
            return Promise.reject(error);
        });

        await expect(osrmProvider.getRoute(point)).rejects.toMatchObject({
            name: "RoutingProviderError",
            provider: "osrm",
            reason: "timeout"
        });
    });

    it("throws a RoutingProviderError with reason 'network' on a plain fetch failure", async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

        await expect(osrmProvider.getRoute(point)).rejects.toMatchObject({
            name: "RoutingProviderError",
            provider: "osrm",
            reason: "network"
        });
    });

    it("throws a RoutingProviderError with reason 'bad_response' on a non-OK HTTP status", async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

        await expect(osrmProvider.getRoute(point)).rejects.toMatchObject({
            reason: "bad_response"
        });
    });

    it("throws a RoutingProviderError with reason 'no_route' when OSRM can't find a route", async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ code: "NoRoute", routes: [] })
        });

        await expect(osrmProvider.getRoute(point)).rejects.toMatchObject({
            reason: "no_route"
        });
    });

    it("throws a RoutingProviderError with reason 'bad_response' when the route is missing distance/duration", async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ code: "Ok", routes: [{}] })
        });

        await expect(osrmProvider.getRoute(point)).rejects.toBeInstanceOf(RoutingProviderError);
    });

    it("throws a RoutingProviderError when the response body isn't valid JSON", async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => {
                throw new SyntaxError("Unexpected token");
            }
        });

        await expect(osrmProvider.getRoute(point)).rejects.toMatchObject({
            reason: "bad_response"
        });
    });
});
