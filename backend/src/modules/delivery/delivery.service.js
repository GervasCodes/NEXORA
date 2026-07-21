const deliveryRepository = require("./delivery.repository");
const deliveryPricingService = require("./deliveryPricing.service");
const orderRepository = require("../order/order.repository");
const notificationService = require("../notification/notification.service");
const pushService = require("../push/push.service");
const settingsService = require("../settings/settings.service");
const earningsService = require("../earnings/earnings.service");
const { haversineKm } = require("../../utils/geo");
const routingService = require("../../services/routing/routing.service");
const {
    DELIVERY_STATUS_TRANSITIONS,
    OFFER_RADIUS_KM,
    OFFER_TIMEOUT_MS
} = require("../../constants/orderStatus");

// Lazy require to dodge the circular dependency (socket.js also lazily
// requires this file for the same reason).
const socket = () => require("../../socket/socket");

exports.getAvailableForPickup = async () => {
    return deliveryRepository.findAvailableForPickup();
};

exports.claimDelivery = async (orderId, agentId) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order) {
        throw new Error("Order not found");
    }

    if (order.status !== "shipped") {
        throw new Error("Order is not ready for pickup");
    }

    const existing = await deliveryRepository.findByOrderId(orderId);
    if (existing) {
        throw new Error("This order has already been claimed");
    }

    const { fee: deliveryFee, distanceKm, durationMinutes, routingProvider } =
        await deliveryPricingService.calculateDeliveryFee(order);
    const deliveryId = await deliveryRepository.create(
        orderId, agentId, deliveryFee, distanceKm, durationMinutes, routingProvider
    );

    // Phase 6: let the admin dispatch dashboard know a new delivery just
    // entered the active pool, without waiting for its next poll/refresh.
    socket().emitToAdmins("dispatch:delivery_assigned", { orderId, deliveryId, agentId });

    return { deliveryId, orderId };
};

exports.getMyDeliveries = async (agentId) => {
    return deliveryRepository.findByAgent(agentId);
};

exports.getDelivery = async (orderId, userId) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order) {
        throw new Error("Order not found");
    }

    const delivery = await deliveryRepository.findByOrderIdWithAgent(orderId);

    if (!delivery) {
        throw new Error("No delivery record for this order yet");
    }

    const isBuyer = order.buyer_id === userId;
    const isAgent = delivery.agent_id === userId;
    const isSellerOnOrder = isBuyer || isAgent
        ? true
        : await orderRepository.sellerHasItemInOrder(orderId, userId);

    if (!isBuyer && !isAgent && !isSellerOnOrder) {
        throw new Error("No delivery record for this order yet");
    }

    // Only relevant once the buyer can actually rate (delivered) or has
    // already rated - cheap to always attach, keeps the frontend from
    // needing a second request just to know whether to show the rating
    // form or the buyer's existing rating.
    const rating = await deliveryRepository.findRatingByOrder(orderId);

    return {
        ...delivery,
        rating: rating || null,
        ...(await buildTrackingSummary(delivery, order))
    };
};

// Shared road-network distance-remaining + ETA calculation (Phase 5C).
// Goes through the routing abstraction layer (OSRM, with an automatic
// straight-line fallback - see services/routing/routing.service.js)
// instead of calling haversineKm + estimateEtaMinutes directly. Returns
// nulls when a required point is missing (agent hasn't shared a location
// yet, order has no delivery pin, etc.) rather than guessing - both the
// tracking REST response and the live socket events already handle a
// null ETA as "calculating…".
//
// Used by both `buildTrackingSummary` (REST GET /delivery/:id) and, as
// of Phase 5C, `updateAgentLocation` (every live "agent:location" ping)
// and `updateDeliveryStatus` (every status transition) - one place
// computes the road-routing ETA, every caller gets the same shape back.
const computeRouteEta = async ({ fromLat, fromLng, destLat, destLng, vehicleType }) => {
    const hasDestination = destLat != null && destLng != null;
    const hasFromPoint = fromLat != null && fromLng != null;

    if (!hasDestination || !hasFromPoint) {
        return {
            distance_remaining_km: null,
            eta_minutes: null,
            routing_provider: null,
            degraded: false
        };
    }

    const route = await routingService.getRoute({
        originLat: Number(fromLat),
        originLng: Number(fromLng),
        destLat: Number(destLat),
        destLng: Number(destLng),
        vehicleType
    });

    return {
        distance_remaining_km: Number(route.distanceKm.toFixed(2)),
        eta_minutes: route.durationMinutes != null ? Math.round(route.durationMinutes) : null,
        routing_provider: route.provider,
        degraded: route.degraded
    };
};

// Road-network distance-remaining + ETA for the tracking widget/full
// page, computed from wherever the agent actually is right now (or their
// pickup pin, if they haven't collected the order yet) to the delivery
// destination.
//
// Phase 5B: goes through the routing abstraction layer instead of calling
// haversineKm + estimateEtaMinutes directly. The returned shape is
// unchanged from before Phase 5B (pickup/destination/distance_remaining_km/
// eta_minutes) with two additive fields - `routing_provider` and
// `degraded` - so existing API consumers that only read the original
// fields keep working untouched.
const buildTrackingSummary = async (delivery, order) => {
    const destLat = order.delivery_lat;
    const destLng = order.delivery_lng;

    const fromLat = delivery.status === "assigned" ? delivery.pickup_lat : delivery.agent_current_lat;
    const fromLng = delivery.status === "assigned" ? delivery.pickup_lng : delivery.agent_current_lng;

    const eta = await computeRouteEta({
        fromLat,
        fromLng,
        destLat,
        destLng,
        vehicleType: delivery.agent_vehicle_type
    });

    return {
        pickup: delivery.pickup_lat != null && delivery.pickup_lng != null
            ? { lat: Number(delivery.pickup_lat), lng: Number(delivery.pickup_lng) }
            : null,
        destination: destLat != null && destLng != null
            ? { lat: Number(destLat), lng: Number(destLng) }
            : null,
        ...eta
    };
};

exports.updateDeliveryStatus = async (orderId, agentId, newStatus, notes) => {
    const delivery = await deliveryRepository.findByOrderId(orderId);

    if (!delivery || delivery.agent_id !== agentId) {
        throw new Error("Delivery not found");
    }

    const allowedNext = DELIVERY_STATUS_TRANSITIONS[delivery.status] || [];

    if (!allowedNext.includes(newStatus)) {
        throw new Error(
            `Cannot move delivery from "${delivery.status}" to "${newStatus}"`
        );
    }

    await deliveryRepository.updateStatus(delivery.id, newStatus, notes);

    // Keep the order's own status in sync with the delivery outcome
    if (newStatus === "delivered") {
        await orderRepository.updateOrderStatus(orderId, "delivered");

        earningsService.creditForDelivery(delivery).catch((err) =>
            console.error("Rider earnings credit error:", err)
        );
    }

    const order = await orderRepository.findOrderById(orderId);
    if (order) {
        await notificationService.notify({
            userId: order.buyer_id,
            type: "delivery_update",
            titleKey: "notifications.delivery.update.title",
            messageKey: "notifications.delivery.update.message",
            messageParams: { orderNumber: order.order_number, status: newStatus },
            relatedOrderId: orderId,
            withEmail: newStatus === "delivered"
        });

        // Phase 5C: a status transition (e.g. "picked_up" -> "in_transit")
        // changes which point the ETA is measured *from* (see
        // buildTrackingSummary - pickup pin vs agent's current position),
        // so recompute it here and push it along with the status itself
        // instead of making the tracking page wait for its own refetch to
        // see an up-to-date ETA. `findByOrderIdWithAgent` re-reads the
        // delivery so `.status` reflects `newStatus` (already persisted
        // above) when deciding which point to route from.
        const deliveryWithAgent = await deliveryRepository.findByOrderIdWithAgent(orderId);
        const eta = deliveryWithAgent
            ? await buildTrackingSummary(deliveryWithAgent, order)
            : { distance_remaining_km: null, eta_minutes: null, routing_provider: null, degraded: false };

        socket().emitToOrder(orderId, "delivery:status", {
            orderId,
            status: newStatus,
            distance_remaining_km: eta.distance_remaining_km,
            eta_minutes: eta.eta_minutes,
            routing_provider: eta.routing_provider,
            degraded: eta.degraded
        });

        // Phase 6: mirror the same status change into the dispatch
        // dashboard's admin-only room, so a delivery moving to
        // "delivered"/"failed" (leaving the active pool) or any other
        // transition is reflected there live instead of only on refresh.
        socket().emitToAdmins("dispatch:delivery_status", {
            orderId,
            deliveryId: delivery.id,
            status: newStatus
        });
    }
};

// ---- Agent presence & location -------------------------------------------

exports.setAgentOnline = async (agentId, isOnline) => {
    await deliveryRepository.setOnlineStatus(agentId, isOnline);

    // Phase 6: dispatch dashboard's online-agents list should update the
    // moment an agent goes on/off shift, not just on its next poll.
    socket().emitToAdmins("dispatch:agent_status", { agentId, isOnline });
};

// Updates the agent's stored position and returns, for each order they're
// currently delivering, the road-routing distance-remaining + ETA from
// this new position to that order's destination - so the socket layer can
// broadcast both the position and an up-to-date ETA into each order-
// tracking room in one go (Phase 5C), instead of the frontend recomputing
// a straight-line ETA locally on every tick (see frontend/src/utils/geo.js).
//
// Before Phase 5C this returned a bare array of order ids; every existing
// caller was internal (socket.js) and has been updated alongside this
// change - see delivery.service.test.js for the current contract.
exports.updateAgentLocation = async (agentId, lat, lng) => {
    await deliveryRepository.updateLocation(agentId, lat, lng);

    const deliveries = await deliveryRepository.findByAgent(agentId);
    const active = deliveries.filter((d) => !["delivered", "failed"].includes(d.status));

    return Promise.all(
        active.map(async (d) => ({
            orderId: d.order_id,
            ...(await computeRouteEta({
                fromLat: lat,
                fromLng: lng,
                destLat: d.delivery_lat,
                destLng: d.delivery_lng,
                vehicleType: d.agent_vehicle_type
            }))
        }))
    );
};

// Lets a socket that just joined an order's tracking room get the
// agent's last known position immediately, instead of waiting for their
// next periodic "agent:location" ping (see socket.js join_order_tracking).
// Returns null rather than throwing when there's nothing to show yet
// (no delivery, no agent location recorded) - this is a best-effort nice-
// to-have, not something that should ever surface an error to the buyer.
exports.getLastKnownAgentPosition = async (orderId) => {
    const delivery = await deliveryRepository.findByOrderId(orderId);
    if (!delivery || ["delivered", "failed"].includes(delivery.status)) return null;

    const agent = await deliveryRepository.findAgentLocation(delivery.agent_id);
    if (!agent || agent.current_lat == null || agent.current_lng == null) return null;

    return { lat: Number(agent.current_lat), lng: Number(agent.current_lng) };
};

// Only the buyer, the assigned agent, or a seller with an item in the
// order may join the live-tracking socket room for it.
exports.assertCanTrackOrder = async (orderId, userId) => {
    const order = await orderRepository.findOrderById(orderId);
    if (!order) throw new Error("Order not found");

    if (order.buyer_id === userId) return true;

    const delivery = await deliveryRepository.findByOrderId(orderId);
    if (delivery && delivery.agent_id === userId) return true;

    const isSeller = await orderRepository.sellerHasItemInOrder(orderId, userId);
    if (isSeller) return true;

    throw new Error("Not authorized to track this order");
};

// ---- Nearest-agent matching (Bolt-style offer queue) ----------------------

// Called when a seller ships an order into the open platform pool (no
// specific roster agent chosen). Offers the order to the nearest online
// agent, with a timeout that falls through to the next-nearest.
exports.startMatching = async (orderId) => {
    const order = await orderRepository.findOrderById(orderId);
    if (!order) return;

    // No pinned destination yet (checkout didn't capture one) — fall back
    // to the manual "available for pickup" pool instead of matching.
    if (order.delivery_lat == null || order.delivery_lng == null) {
        return;
    }

    await offerToNextCandidate(orderId, order.delivery_lat, order.delivery_lng);
};

const offerToNextCandidate = async (orderId, destLat, destLng) => {
    // Someone may have manually claimed it while offers were in flight.
    const existingDelivery = await deliveryRepository.findByOrderId(orderId);
    if (existingDelivery) return;

    const candidates = await deliveryRepository.findCandidateAgents(orderId);

    const ranked = candidates
        .map((agent) => ({
            ...agent,
            distanceKm: haversineKm(destLat, destLng, agent.current_lat, agent.current_lng)
        }))
        .filter((agent) => agent.distanceKm <= OFFER_RADIUS_KM)
        .sort((a, b) => a.distanceKm - b.distanceKm);

    if (ranked.length === 0) {
        // Nobody in range right now — order just sits in the manual pool
        // (findAvailableForPickup) until an agent claims it or comes online
        // and a future order/retry triggers matching again.
        return;
    }

    const nearest = ranked[0];
    const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_MS);
    const offerId = await deliveryRepository.createOffer(
        orderId,
        nearest.id,
        nearest.distanceKm,
        expiresAt
    );

    const order = await orderRepository.findOrderById(orderId);

    socket().emitToUser(nearest.id, "delivery:offer", {
        offerId,
        orderId,
        orderNumber: order.order_number,
        shippingAddress: order.shipping_address,
        shippingCity: order.shipping_city,
        distanceKm: Math.round(nearest.distanceKm * 10) / 10,
        expiresInMs: OFFER_TIMEOUT_MS
    });

    pushService
        .sendToUser(nearest.id, {
            title: "New delivery nearby",
            body: `${order.order_number} · ${Math.round(nearest.distanceKm * 10) / 10} km away`,
            offerId,
            orderId
        })
        .catch((err) => console.error("Push send error:", err));

    setTimeout(() => {
        expireAndAdvance(offerId, orderId, destLat, destLng).catch((err) =>
            console.error("Offer expiry error:", err)
        );
    }, OFFER_TIMEOUT_MS);
};

const expireAndAdvance = async (offerId, orderId, destLat, destLng) => {
    const stillPending = await deliveryRepository.expireOffer(offerId);
    if (!stillPending) return; // already accepted/declined

    await offerToNextCandidate(orderId, destLat, destLng);
};

exports.acceptOffer = async (offerId, agentId) => {
    const offer = await deliveryRepository.findOfferById(offerId);
    if (!offer || offer.agent_id !== agentId) {
        throw new Error("Offer not found");
    }

    const existingDelivery = await deliveryRepository.findByOrderId(offer.order_id);
    if (existingDelivery) {
        throw new Error("This order has already been claimed");
    }

    const accepted = await deliveryRepository.acceptOffer(offerId, agentId);
    if (!accepted) {
        throw new Error("This offer has expired");
    }

    const order = await orderRepository.findOrderById(offer.order_id);

    const { fee: deliveryFee, distanceKm, durationMinutes, routingProvider } = order
        ? await deliveryPricingService.calculateDeliveryFee(order)
        : { fee: await settingsService.getRiderDeliveryFee(), distanceKm: null, durationMinutes: null, routingProvider: null };
    await deliveryRepository.create(offer.order_id, agentId, deliveryFee, distanceKm, durationMinutes, routingProvider);

    if (order) {
        await notificationService.notify({
            userId: order.buyer_id,
            type: "delivery_assigned",
            titleKey: "notifications.delivery.pickedUp.title",
            messageKey: "notifications.delivery.pickedUp.message",
            messageParams: { orderNumber: order.order_number },
            relatedOrderId: offer.order_id,
            withEmail: true
        });

        socket().emitToOrder(offer.order_id, "delivery:assigned", {
            orderId: offer.order_id,
            agentId
        });

        // Phase 6: same as the manual-claim path above - a matched
        // (offer-accepted) delivery should also appear on the dispatch
        // dashboard immediately.
        socket().emitToAdmins("dispatch:delivery_assigned", {
            orderId: offer.order_id,
            agentId
        });
    }

    return { orderId: offer.order_id, deliveryId: offer.order_id };
};

// ---- Post-delivery ratings (migration 032) --------------------------------

// Only the buyer of the order can rate, only after the delivery has
// actually completed, and only once - same "one rating per subject"
// shape reviews.js uses for products, just enforced against
// delivery_ratings' UNIQUE(order_id) instead of UNIQUE(buyer_id, product_id).
exports.rateDelivery = async (orderId, buyerId, rating, comment) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order || order.buyer_id !== buyerId) {
        throw new Error("Order not found");
    }

    const delivery = await deliveryRepository.findByOrderId(orderId);

    if (!delivery) {
        throw new Error("No delivery record for this order yet");
    }

    if (delivery.status !== "delivered") {
        throw new Error("You can only rate a delivery agent after your order has been delivered");
    }

    const existing = await deliveryRepository.findRatingByOrder(orderId);
    if (existing) {
        throw new Error("You've already rated this delivery");
    }

    const ratingId = await deliveryRepository.createRating(
        orderId,
        delivery.agent_id,
        buyerId,
        rating,
        comment
    );

    return { ratingId };
};

// Agent-facing summary (average + count) for their own dashboard.
exports.getMyRatingSummary = async (agentId) => {
    const [summary, ratings] = await Promise.all([
        deliveryRepository.getAgentRatingSummary(agentId),
        deliveryRepository.findRatingsByAgent(agentId)
    ]);

    return {
        average_rating: summary.average_rating
            ? Number(Number(summary.average_rating).toFixed(1))
            : null,
        rating_count: summary.rating_count,
        ratings
    };
};

exports.declineOffer = async (offerId, agentId) => {
    const offer = await deliveryRepository.findOfferById(offerId);
    if (!offer || offer.agent_id !== agentId) {
        throw new Error("Offer not found");
    }

    await deliveryRepository.declineOffer(offerId, agentId);

    const order = await orderRepository.findOrderById(offer.order_id);
    if (order) {
        await offerToNextCandidate(offer.order_id, order.delivery_lat, order.delivery_lng);
    }
};
