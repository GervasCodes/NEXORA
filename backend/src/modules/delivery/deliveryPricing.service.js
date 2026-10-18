const orderRepository = require("../order/order.repository");
const sellerRepository = require("../seller/seller.repository");
const settingsService = require("../settings/settings.service");
const routingService = require("../../services/routing/routing.service");
const deliveryRatesService = require("./deliveryRates.service");
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
// the pickup -> delivery distance now comes from the routing
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
// (Checkout & Order Timeline UX): the actual pin-to-pin math is
// pulled out into estimateDeliveryForRoute below so it can also be used
// pre-order (Checkout.jsx's upfront estimate, via
// order.service.js#getDeliveryEstimate) - at that point there's no order
// row yet to look a seller id up from, just a cart's seller ids and
// whatever pickup pins they already have on file. This function's job is
// now just resolving "which order -> which seller's pickup pin" before
// delegating to it; same flat-fee fallback shape/reasoning as before.
// Round 5, Phase 5 - the fee is now priced from effective-dated per-vehicle
// rate cards x a fuel factor (see deliveryRates.service.js). The old distance
// bands above remain the fallback when no rate card exists, and the flat
// rider_delivery_fee remains the fallback when a pin is missing.
// `durationMinutes` now includes the admin-configured peak-hour adjustment
// (`routeDurationMinutes` is the raw routing value); the checkout estimate
// adds its own handling buffer on top (order.service.js#getDeliveryEstimate).
// `region` only selects fuel caps and ETA windows (falls back to the default
// region).
exports.estimateDeliveryForRoute = async ({ pickupLat, pickupLng, deliveryLat, deliveryLng, vehicleType, region }) => {
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

    const quote = await deliveryRatesService.quoteRiderPay({ distanceKm: route.distanceKm, vehicleType, region });

    let fee;
    let pricing;
    if (quote) {
        fee = quote.fee;
        pricing = {
            pricingMethod: "rate_card",
            vehicle: quote.vehicle,
            rateCardId: quote.cardId,
            fuelFactor: quote.fuel.factor,
            fuelCap: quote.fuel.cap
        };
    } else {
        const bands = await settingsService.getDeliveryDistanceBands();
        fee = computeBandedFee(route.distanceKm, bands, flatFee);
        pricing = { pricingMethod: "bands" };
    }

    const routeDuration = route.durationMinutes != null ? Math.round(route.durationMinutes) : null;
    const durationMinutes = await deliveryRatesService.adjustEta(routeDuration, { region });

    return {
        fee,
        distanceKm: Number(route.distanceKm.toFixed(2)),
        durationMinutes,
        routeDurationMinutes: routeDuration,
        method: "distance",
        routingProvider: route.provider,
        degraded: route.degraded,
        ...pricing
    };
};

const estimateForOrder = async (order, vehicleType) => {
    const none = { pickupLat: null, pickupLng: null, deliveryLat: null, deliveryLng: null };

    if (order.delivery_lat == null || order.delivery_lng == null) {
        return exports.estimateDeliveryForRoute(none);
    }

    const sellerId = await orderRepository.findOrderSellerId(order.id);
    if (!sellerId) {
        return exports.estimateDeliveryForRoute(none);
    }

    const seller = await sellerRepository.findByUserId(sellerId);

    return exports.estimateDeliveryForRoute({
        pickupLat: seller?.pickup_lat,
        pickupLng: seller?.pickup_lng,
        deliveryLat: order.delivery_lat,
        deliveryLng: order.delivery_lng,
        vehicleType,
        region: order.shipping_region
    });
};

// What the agent is paid for `order`. An order placed after migration 150
// carries the quote taken at checkout and that quote is returned as-is, so a
// later rate or fuel change never rewrites it. Older orders (no quote) are
// priced live. `vehicleType` only matters for live pricing.
exports.calculateDeliveryFee = async (order, vehicleType) => {
    if (order.rider_fee_quote != null) {
        const details = typeof order.rider_fee_quote_details === "string"
            ? JSON.parse(order.rider_fee_quote_details)
            : (order.rider_fee_quote_details || {});

        return {
            fee: Number(order.rider_fee_quote),
            distanceKm: details.distanceKm ?? null,
            durationMinutes: details.durationMinutes ?? null,
            method: details.method || "flat",
            routingProvider: details.routingProvider ?? null,
            quoted: true
        };
    }

    return estimateForOrder(order, vehicleType);
};

// Called once per deliverable order right after checkout creates it. Uses the
// platform default vehicle (the agent isn't known yet) and stores the result
// on the order. Never throws into checkout - an order without a quote is
// simply priced live later, exactly as before this feature.
exports.snapshotRiderFee = async (orderId) => {
    const order = await orderRepository.findOrderById(orderId);
    if (!order || order.is_parent || order.rider_fee_quote != null) return null;

    const estimate = await estimateForOrder(order);

    await orderRepository.setRiderFeeQuote(orderId, estimate.fee, {
        method: estimate.method,
        distanceKm: estimate.distanceKm,
        durationMinutes: estimate.durationMinutes,
        routingProvider: estimate.routingProvider ?? null,
        pricingMethod: estimate.pricingMethod ?? "flat",
        vehicle: estimate.vehicle ?? null,
        rateCardId: estimate.rateCardId ?? null,
        fuelFactor: estimate.fuelFactor ?? null,
        fuelCap: estimate.fuelCap ?? null
    });

    return estimate;
};
