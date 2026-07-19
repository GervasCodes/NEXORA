const orderRepository = require("../order/order.repository");
const sellerRepository = require("../seller/seller.repository");
const settingsService = require("../settings/settings.service");
const { haversineKm } = require("../../utils/geo");
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
exports.calculateDeliveryFee = async (order) => {
    const flatFee = await settingsService.getRiderDeliveryFee();

    if (order.delivery_lat == null || order.delivery_lng == null) {
        return { fee: flatFee, distanceKm: null, method: "flat" };
    }

    const sellerId = await orderRepository.findOrderSellerId(order.id);
    if (!sellerId) {
        return { fee: flatFee, distanceKm: null, method: "flat" };
    }

    const seller = await sellerRepository.findByUserId(sellerId);
    if (!seller || seller.pickup_lat == null || seller.pickup_lng == null) {
        return { fee: flatFee, distanceKm: null, method: "flat" };
    }

    const distanceKm = haversineKm(
        Number(seller.pickup_lat), Number(seller.pickup_lng),
        Number(order.delivery_lat), Number(order.delivery_lng)
    );

    const bands = await settingsService.getDeliveryDistanceBands();
    const fee = computeBandedFee(distanceKm, bands, flatFee);

    return { fee, distanceKm: Number(distanceKm.toFixed(2)), method: "distance" };
};
