const deliveryRepository = require("./delivery.repository");
const deliveryPricingService = require("./deliveryPricing.service");
const orderRepository = require("../order/order.repository");
const notificationService = require("../notification/notification.service");
const pushService = require("../push/push.service");
const settingsService = require("../settings/settings.service");
const earningsService = require("../earnings/earnings.service");
const { haversineKm } = require("../../utils/geo");
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

    const { fee: deliveryFee, distanceKm } = await deliveryPricingService.calculateDeliveryFee(order);
    const deliveryId = await deliveryRepository.create(orderId, agentId, deliveryFee, distanceKm);

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

    return { ...delivery, rating: rating || null };
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

        socket().emitToOrder(orderId, "delivery:status", { orderId, status: newStatus });
    }
};

// ---- Agent presence & location -------------------------------------------

exports.setAgentOnline = async (agentId, isOnline) => {
    await deliveryRepository.setOnlineStatus(agentId, isOnline);
};

// Updates the agent's stored position and returns the list of order ids
// they're currently delivering, so the socket layer can broadcast the new
// position into each of those order-tracking rooms.
exports.updateAgentLocation = async (agentId, lat, lng) => {
    await deliveryRepository.updateLocation(agentId, lat, lng);

    const deliveries = await deliveryRepository.findByAgent(agentId);
    return deliveries
        .filter((d) => !["delivered", "failed"].includes(d.status))
        .map((d) => d.order_id);
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

    const { fee: deliveryFee, distanceKm } = order
        ? await deliveryPricingService.calculateDeliveryFee(order)
        : { fee: await settingsService.getRiderDeliveryFee(), distanceKm: null };
    await deliveryRepository.create(offer.order_id, agentId, deliveryFee, distanceKm);

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
