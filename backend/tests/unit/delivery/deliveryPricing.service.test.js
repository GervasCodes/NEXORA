jest.mock("../../../src/modules/order/order.repository");
jest.mock("../../../src/modules/seller/seller.repository");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/services/routing/routing.service");

const orderRepository = require("../../../src/modules/order/order.repository");
const sellerRepository = require("../../../src/modules/seller/seller.repository");
const settingsService = require("../../../src/modules/settings/settings.service");
const routingService = require("../../../src/services/routing/routing.service");

const deliveryPricingService = require("../../../src/modules/delivery/deliveryPricing.service");

const BANDS = {
    bands: [
        { up_to_km: 3, fee: 2000 },
        { up_to_km: 7, fee: 4000 }
    ],
    per_km_beyond: 600
};

const order = { id: 1, delivery_lat: -6.80, delivery_lng: 39.20 };

beforeEach(() => {
    settingsService.getRiderDeliveryFee.mockResolvedValue(3000);
    settingsService.getDeliveryDistanceBands.mockResolvedValue(BANDS);
});

describe("deliveryPricing.service.calculateDeliveryFee - flat fallback", () => {
    it("returns the flat fee (and never calls the routing service) when the order has no delivery pin", async () => {
        const result = await deliveryPricingService.calculateDeliveryFee({ id: 1, delivery_lat: null, delivery_lng: null });

        expect(result).toEqual({ fee: 3000, distanceKm: null, durationMinutes: null, method: "flat" });
        expect(routingService.getRoute).not.toHaveBeenCalled();
    });

    it("returns the flat fee when the order has no seller", async () => {
        orderRepository.findOrderSellerId.mockResolvedValue(null);

        const result = await deliveryPricingService.calculateDeliveryFee(order);

        expect(result).toEqual({ fee: 3000, distanceKm: null, durationMinutes: null, method: "flat" });
        expect(routingService.getRoute).not.toHaveBeenCalled();
    });

    it("returns the flat fee when the seller hasn't set a pickup pin", async () => {
        orderRepository.findOrderSellerId.mockResolvedValue(10);
        sellerRepository.findByUserId.mockResolvedValue({ pickup_lat: null, pickup_lng: null });

        const result = await deliveryPricingService.calculateDeliveryFee(order);

        expect(result).toEqual({ fee: 3000, distanceKm: null, durationMinutes: null, method: "flat" });
        expect(routingService.getRoute).not.toHaveBeenCalled();
    });
});

describe("deliveryPricing.service.calculateDeliveryFee - road-routed distance (Phase 5B)", () => {
    beforeEach(() => {
        orderRepository.findOrderSellerId.mockResolvedValue(10);
        sellerRepository.findByUserId.mockResolvedValue({ pickup_lat: -6.85, pickup_lng: 39.25 });
    });

    it("routes seller pickup -> order delivery pin through the routing service", async () => {
        routingService.getRoute.mockResolvedValue({
            distanceKm: 5.5, durationMinutes: 14, provider: "osrm", degraded: false
        });

        const result = await deliveryPricingService.calculateDeliveryFee(order);

        expect(routingService.getRoute).toHaveBeenCalledWith({
            originLat: -6.85, originLng: 39.25, destLat: -6.8, destLng: 39.2, vehicleType: undefined
        });
        expect(result).toEqual({
            fee: 4000, // 5.5km falls in the "up to 7km" band
            distanceKm: 5.5,
            durationMinutes: 14,
            method: "distance",
            routingProvider: "osrm",
            degraded: false
        });
    });

    it("passes vehicleType through to the routing service when given", async () => {
        routingService.getRoute.mockResolvedValue({
            distanceKm: 2, durationMinutes: 8, provider: "osrm", degraded: false
        });

        await deliveryPricingService.calculateDeliveryFee(order, "bicycle");

        expect(routingService.getRoute).toHaveBeenCalledWith(
            expect.objectContaining({ vehicleType: "bicycle" })
        );
    });

    it("still returns a usable fee when the routing service degrades to the straight-line fallback", async () => {
        routingService.getRoute.mockResolvedValue({
            distanceKm: 9.1, durationMinutes: 25, provider: "fallback", degraded: true
        });

        const result = await deliveryPricingService.calculateDeliveryFee(order);

        expect(result.method).toBe("distance");
        expect(result.routingProvider).toBe("fallback");
        expect(result.degraded).toBe(true);
        expect(result.fee).toBeGreaterThan(4000); // past the last band, per-km-beyond applies
    });

    it("rounds distanceKm to 2 decimal places and durationMinutes to the nearest whole minute", async () => {
        routingService.getRoute.mockResolvedValue({
            distanceKm: 5.5555, durationMinutes: 14.6, provider: "osrm", degraded: false
        });

        const result = await deliveryPricingService.calculateDeliveryFee(order);

        expect(result.distanceKm).toBe(5.56);
        expect(result.durationMinutes).toBe(15);
    });
});
