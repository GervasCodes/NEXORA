const orderRepository = require("../order/order.repository");
const sellerRepository = require("../seller/seller.repository");
const settingsService = require("../settings/settings.service");
const routingService = require("../../services/routing/routing.service");
const { computeBandedFee } = require("../../utils/deliveryPricing");

// Computes what a delivery agent should be paid for delivering `order`.
// Prefers Tanzania distance-band pricing (seller's pickup pin -> the
// order's own delivery pin, run through the admin-configured bands - see
// settingsService.getDeliveryDistanceBands), and falls back to the flat
// rider_delivery_fee whenever either pin is missing - which covers the
// two most common gaps: an order placed with no map pin at checkout, or
// a seller who hasn't set a pickup location yet in Store settings.
//
// `order` must be a non-parent order (standalone or a Phase-3 vendor
// child order) - a parent order has no order_items of its own and so no
// single seller to measure from. Every call site here only ever deals
// with orders that are about to be (or already are) shipped, which by
// definition are never parent orders.
//
// Phase 5D: the pickup -> delivery distance now comes from the routing
// abstraction layer (OSRM road distance, with its own automatic
// straight-line fallback - see services/routing/routing.service.js)
// instead of calling haversineKm directly. `computeBandedFee` itself is
// unchanged - only where the distance number comes from changed, so the
// admin-configured bands still apply to the same style of "how far is
// this" number, just a more accurate one. `vehicleType` is an optional
// second parameter (only affects which OSRM profile is used - e.g. a
// bicycle agent's fee is measured off cycling-appropriate roads rather
// than a car route - never which fee band a distance falls into); every
// existing call site keeps working unchanged since it's optional.
//
// The flat-fee shape intentionally stays `{ fee, distanceKm: null,
// durationMinutes: null, method: "flat" }` - no routing call is made at
// all when there's no pin pair to route between, so there's no
// routingProvider/degraded to report either.
//
// Phase 6 (Checkout & Order Timeline UX): the actual pin-to-pin math is
// pulled out into estimateDeliveryForRoute below so it can also be used
// pre-order (Checkout.jsx's upfront estimate, via
// order.service.js#getDeliveryEstimate) - at that point there's no order
// row yet to look a seller id up from, just a cart's seller ids and
// whatever pickup pins they already have on file. This function's job is
// now just resolving "which order -> which seller's pickup pin" before
// delegating to it; same flat-fee fallback shape/reasoning as before.
exports.estimateDeliveryForRoute = async ({ pickupLat, pickupLng, deliveryLat, deliveryLng, vehicleType }) => {
    const flatFee = await settingsService.getRiderDeliveryFee();

    if (pickupLat == null || pickupLng == null || deliveryLat == null || deliveryLng == null) {
        return { fee: flatFee, distanceKm: null, durationMinutes: null, method: "flat" };
    }

    const route = await routingService.getRoute({
        originLat: Number(pickupLat),
        originLng: Number(pickupLng),
        destLat: Number(deliveryLat),
        destLng: Number(deliveryLng),
        vehicleType
    });

    const bands = await settingsService.getDeliveryDistanceBands();
    const fee = computeBandedFee(route.distanceKm, bands, flatFee);

    return {
        fee,
        distanceKm: Number(route.distanceKm.toFixed(2)),
        durationMinutes: route.durationMinutes != null ? Math.round(route.durationMinutes) : null,
        method: "distance",
        routingProvider: route.provider,
        degraded: route.degraded
    };
};

exports.calculateDeliveryFee = async (order, vehicleType) => {
    if (order.delivery_lat == null || order.delivery_lng == null) {
        return exports.estimateDeliveryForRoute({ pickupLat: null, pickupLng: null, deliveryLat: null, deliveryLng: null });
    }

    const sellerId = await orderRepository.findOrderSellerId(order.id);
    if (!sellerId) {
        return exports.estimateDeliveryForRoute({ pickupLat: null, pickupLng: null, deliveryLat: null, deliveryLng: null });
    }

    const seller = await sellerRepository.findByUserId(sellerId);

    return exports.estimateDeliveryForRoute({
        pickupLat: seller?.pickup_lat,
        pickupLng: seller?.pickup_lng,
        deliveryLat: order.delivery_lat,
        deliveryLng: order.delivery_lng,
        vehicleType
    });
};
