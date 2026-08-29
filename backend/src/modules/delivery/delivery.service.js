const deliveryRepository = require("./delivery.repository");
const deliveryPricingService = require("./deliveryPricing.service");
const orderRepository = require("../order/order.repository");
const sellerRepository = require("../seller/seller.repository");
const notificationService = require("../notification/notification.service");
const logger = require("../../utils/logger").child({ module: "delivery" });
const Sentry = require("../../config/sentry");
const pushService = require("../push/push.service");
const settingsService = require("../settings/settings.service");
const earningsService = require("../earnings/earnings.service");
const { haversineKm } = require("../../utils/geo");
const routingService = require("../../services/routing/routing.service");
const agentScoring = require("./agentScoring");
const dispatchQueue = require("../../queues/dispatchQueue");
const { DELIVERY_STATUS_TRANSITIONS } = require("../../constants/orderStatus");
// Roadmap Phase 1 (WhatsApp/SMS as an Offer-Accept Channel).
const whatsappProvider = require("../whatsapp/providers/whatsapp.provider");
const smsProvider = require("../sms/providers/sms.provider");

// Lazy require to dodge the circular dependency (socket.js also lazily
// requires this file for the same reason).
const socket = () => require("../../socket/socket");

// Mirrors the ER_DUP_ENTRY code mysql2 throws on a UNIQUE constraint hit -
// same helper refund.service.js uses for the same reason (see that
// module's isDuplicateKeyError comment).
const isDuplicateKeyError = (err) => err && (err.code === "ER_DUP_ENTRY" || err.errno === 1062);

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

    // The findByOrderId check above is check-then-act: two agents racing to
    // claim the same order can both pass it before either has inserted a
    // row. deliveries.order_id is UNIQUE, so the DB itself is the real
    // guard - whichever insert loses that race throws ER_DUP_ENTRY here.
    // Translate that into the same friendly message the up-front check
    // gives, instead of letting a raw DB error surface to the losing agent.
    let deliveryId;
    try {
        deliveryId = await deliveryRepository.create(
            orderId, agentId, deliveryFee, distanceKm, durationMinutes, routingProvider
        );
    } catch (err) {
        if (isDuplicateKeyError(err)) {
            throw new Error("This order has already been claimed");
        }
        throw err;
    }

    // Phase 6: let the admin dispatch dashboard know a new delivery just
    // entered the active pool, without waiting for its next poll/refresh.
    socket().emitToAdmins("dispatch:delivery_assigned", { orderId, deliveryId, agentId });

    return { deliveryId, orderId };
};

// Phase 3 (Admin Manual Override & Ops Visibility) - staff picking a
// specific online agent for a specific unmatched order from the dispatch
// board, bypassing automatic radius-based matching (startMatching) and
// the periodic rematch sweep (jobs/deliveryRematch.job.js) entirely.
// Shares claimDelivery's guard clauses and delivery-row creation above
// (same UNIQUE-constraint race handling), but unlike a self-claim the
// agent didn't ask for this job, so - like an accepted offer (see
// acceptOffer below) - they get told about it: a push + in-app
// notification, reusing the exact same notification keys
// order.service.js already uses when a seller assigns one of their own
// roster agents (notifications.delivery.assigned.*), since the meaning
// to the agent ("you've been given a delivery") is identical either way.
// The buyer and admin board get the same events any other assignment
// path already emits.
exports.adminAssignDelivery = async (orderId, agentId) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order) {
        throw new Error("Order not found");
    }

    if (order.status !== "shipped") {
        throw new Error("Order is not ready for pickup");
    }

    const existing = await deliveryRepository.findByOrderId(orderId);
    if (existing) {
        throw new Error("This order already has a delivery assigned");
    }

    const agent = await deliveryRepository.findOnlineAgentById(agentId);
    if (!agent) {
        throw new Error("Agent not found");
    }
    if (!agent.is_online) {
        throw new Error("That agent is currently offline");
    }

    const { fee: deliveryFee, distanceKm, durationMinutes, routingProvider } =
        await deliveryPricingService.calculateDeliveryFee(order);

    // Same check-then-act race as claimDelivery above - the UNIQUE
    // constraint on deliveries.order_id is the real guard.
    let deliveryId;
    try {
        deliveryId = await deliveryRepository.create(
            orderId, agentId, deliveryFee, distanceKm, durationMinutes, routingProvider
        );
    } catch (err) {
        if (isDuplicateKeyError(err)) {
            throw new Error("This order already has a delivery assigned");
        }
        throw err;
    }

    await notificationService.notify({
        userId: agentId,
        type: "delivery_assigned",
        titleKey: "notifications.delivery.assigned.title",
        messageKey: "notifications.delivery.assigned.message",
        messageParams: { orderNumber: order.order_number },
        relatedOrderId: orderId,
        withEmail: true
    });

    pushService
        .sendToUser(agentId, {
            title: "New delivery assigned",
            body: `${order.order_number} was assigned to you by an admin`,
            orderId
        })
        .catch((err) => logger.warn({ err, orderId, agentId }, "push send error"));

    await notificationService.notify({
        userId: order.buyer_id,
        type: "delivery_assigned",
        titleKey: "notifications.delivery.pickedUp.title",
        messageKey: "notifications.delivery.pickedUp.message",
        messageParams: { orderNumber: order.order_number },
        relatedOrderId: orderId,
        withEmail: true
    });

    socket().emitToOrder(orderId, "delivery:assigned", { orderId, agentId });
    socket().emitToAdmins("dispatch:delivery_assigned", { orderId, deliveryId, agentId });

    return { deliveryId, orderId, agentId };
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

        earningsService.creditForDelivery(delivery).catch((err) => {
            logger.error({ err, orderId }, "rider earnings credit error");
            Sentry.captureException(err, { tags: { area: "delivery", stage: "earnings-credit" }, extra: { orderId } });
        });
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

// Lets the frontend hydrate its shift toggle from the persisted value on
// page load, refresh, or session restoration instead of always defaulting
// to "off" (see useAgentShift.js) - is_online itself was always being
// persisted correctly; the toggle turning off on refresh was the
// frontend never reading it back, compounded by the socket "disconnect"
// handler treating a page refresh's momentary disconnect the same as the
// agent actually going offline (see socket.js's reconnect grace period).
exports.getAgentOnlineStatus = async (agentId) => {
    const isOnline = await deliveryRepository.getOnlineStatus(agentId);
    return { isOnline };
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
//
// Dispatch ranks agents by proximity/ETA to the SELLER'S pickup point, not
// the buyer's delivery destination — an agent needs to reach the shop and
// collect the order before the buyer's location matters at all. Every
// non-parent order has exactly one seller (see order.repository's
// findOrderSellerId), so there's always a single pickup pin to measure
// candidates against once the seller has set one in Store settings.

// Resolves the pickup point (lat/lng + a bit of display info) an order
// should be matched from. Returns null when there's nothing to route from
// yet (no seller on the order, or the seller hasn't set a pickup pin) —
// callers fall back to the manual "available for pickup" pool in that
// case, same as a missing buyer pin used to.
const getSellerPickupPoint = async (order) => {
    const sellerId = await orderRepository.findOrderSellerId(order.id);
    if (!sellerId) return null;

    const seller = await sellerRepository.findByUserId(sellerId);
    if (!seller || seller.pickup_lat == null || seller.pickup_lng == null) return null;

    return {
        lat: Number(seller.pickup_lat),
        lng: Number(seller.pickup_lng),
        storeName: seller.store_name,
        address: seller.address
    };
};

// How many of the closest-by-straight-line candidates get a real
// road-routing ETA lookup. Keeps "smart dispatch" (ranking by actual
// travel time, not just as-the-crow-flies distance) cheap even when a
// lot of agents are online — we only ever need to compare a handful of
// genuinely-nearby agents to find the one who can reach the shop
// soonest, not every online agent in the city.
const ETA_CANDIDATE_POOL_SIZE = 5;

// Called when a seller ships an order into the open platform pool (no
// specific roster agent chosen), and by the periodic re-check job
// (jobs/deliveryRematch.job.js) retrying an order that's been sitting in
// the manual pool. Offers the order to whichever online agent can reach
// the SELLER'S shop soonest, with a timeout that falls through to the
// next-best candidate - widening the search radius (see
// offerToNextCandidate) once a given radius runs out of candidates.
// Always starts at the smallest configured radius step (radiusIndex 0),
// even on a re-check retry - an agent that's come online since the last
// attempt may now be in range of the tightest step, and re-widening from
// there is cheap (empty radii are skipped instantly, see
// offerToNextCandidate).
exports.startMatching = async (orderId) => {
    const order = await orderRepository.findOrderById(orderId);
    if (!order) return;

    const pickup = await getSellerPickupPoint(order);

    // No seller pickup pin yet (seller hasn't set one in Store settings) —
    // fall back to the manual "available for pickup" pool instead of
    // matching.
    if (!pickup) return;

    await offerToNextCandidate(orderId, pickup, 0);
};

// Ranks candidates by straight-line distance to the shop first (cheap,
// no network calls), then asks the routing layer for a real travel-time
// ETA on just the closest few (see ETA_CANDIDATE_POOL_SIZE) and, within
// that same small pool, scores each candidate on ETA plus historical
// reliability (Roadmap Phase 2 - see agentScoring.js) rather than ETA
// alone. A nearer/faster agent with a poor accept/completion track
// record can lose out to a slightly-slower one who's more likely to
// actually show up and finish the job - which pure ETA ranking would
// miss. Falls back to the haversine ranking untouched if a routing
// lookup fails for some agent (the routing layer's own fallback
// provider means that's effectively never, but this keeps dispatch
// working either way).
const rankCandidatesBySellerEta = async (candidates, pickup, radiusKm) => {
    const inRange = candidates
        .map((agent) => ({
            ...agent,
            distanceKm: haversineKm(pickup.lat, pickup.lng, agent.current_lat, agent.current_lng)
        }))
        .filter((agent) => agent.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);

    if (inRange.length === 0) return [];

    const etaPool = inRange.slice(0, ETA_CANDIDATE_POOL_SIZE);

    const withEta = await Promise.all(
        etaPool.map(async (agent) => {
            try {
                const route = await routingService.getRoute({
                    originLat: agent.current_lat,
                    originLng: agent.current_lng,
                    destLat: pickup.lat,
                    destLng: pickup.lng,
                    vehicleType: agent.vehicle_type
                });
                return { ...agent, etaMinutesToSeller: route.durationMinutes };
            } catch {
                // Unknown ETA — keep the agent, just don't let a routing
                // hiccup drop them from consideration.
                return { ...agent, etaMinutesToSeller: null };
            }
        })
    );

    // Roadmap Phase 2: pull acceptance/completion history for just this
    // small pool (one batched query each, not one per agent - see
    // delivery.repository.js#findAgentPerformanceStats) and fold it
    // into a single weighted score per candidate, instead of sorting by
    // etaMinutesToSeller alone.
    const performanceStats = await deliveryRepository.findAgentPerformanceStats(
        withEta.map((agent) => agent.id)
    );

    const scored = withEta.map((agent) => {
        const stats = performanceStats[agent.id] || { acceptanceRate: null, completionRate: null };
        const withStats = { ...agent, ...stats };
        return { ...withStats, score: agentScoring.scoreCandidate(withStats) };
    });

    scored.sort((a, b) => b.score - a.score);

    // Anyone outside the ETA pool was already further away by straight-
    // line distance than every agent we actually timed/scored, so they
    // stay ranked behind the scored group.
    return [...scored, ...inRange.slice(ETA_CANDIDATE_POOL_SIZE)];
};

// Schedules the "has this offer timed out?" check via the durable
// BullMQ queue (see queues/dispatchQueue.js) when Redis is configured,
// so it survives a restart and is only ever processed once even with
// multiple server instances running. Falls back to the old bare
// setTimeout only when Redis isn't configured at all (local dev/CI -
// see config/redis.js) - that fallback has the same non-durability
// limitation the pre-Phase-1 code always had (lost on restart, doesn't
// coordinate across instances), which is acceptable for a dev/CI
// environment that also has no persistent Redis, but is never expected
// in a real deployment (which is expected to have REDIS_URL set, same
// as the caching layer already needs for it to do anything).
const scheduleOfferExpiry = async (offerId, orderId, pickup, radiusIndex, timeoutMs) => {
    const queue = dispatchQueue.getQueue();

    if (queue) {
        await queue.add(
            dispatchQueue.JOB_NAMES.OFFER_EXPIRE,
            { offerId, orderId, pickup, radiusIndex },
            {
                delay: timeoutMs,
                // Deterministic id (rather than an auto-generated one) -
                // not load-bearing today since nothing ever needs to
                // look this job back up or cancel it (an accepted offer
                // just makes expireOffer's UPDATE a no-op below), but it
                // keeps at most one expiry job per offer if this were
                // ever called twice for the same offer. BullMQ custom
                // job ids can't contain ":" (it's used as an internal
                // Redis-key delimiter), so this uses "-" instead.
                jobId: `offer-expire-${offerId}`,
                removeOnComplete: true,
                removeOnFail: true
            }
        );
        return;
    }

    setTimeout(() => {
        handleOfferExpiryJob({ offerId, orderId, pickup, radiusIndex }).catch((err) => {
            logger.error({ err, offerId, orderId }, "offer expiry error (non-durable fallback - Redis not configured)");
            Sentry.captureException(err, {
                tags: { area: "delivery", stage: "offer-expiry-fallback" },
                extra: { offerId, orderId }
            });
        });
    }, timeoutMs);
};

// Nearest-agent matching, one radius step at a time. `radiusIndex`
// selects which configured radius step (see
// settingsService.getDeliveryOfferRadiusStepsKm) to search within on
// this attempt:
//   - if an agent is found, they're offered the order and a durable
//     expiry timer is scheduled (see scheduleOfferExpiry) carrying the
//     SAME radiusIndex, so a timeout/decline tries the next candidate at
//     this same radius before ever widening it;
//   - if nobody is currently online within this radius at all, there's
//     nothing to wait out a timeout for, so this widens to the next
//     radius step immediately;
//   - once every configured radius step has been tried with no luck,
//     the order is left in the manual "available for pickup" pool -
//     picked up either by a human claiming it, or by the periodic
//     re-check job (jobs/deliveryRematch.job.js) retrying matching from
//     radiusIndex 0 again on its next tick.
const offerToNextCandidate = async (orderId, pickup, radiusIndex) => {
    // Someone may have manually claimed it while offers were in flight.
    const existingDelivery = await deliveryRepository.findByOrderId(orderId);
    if (existingDelivery) return;

    const radiusSteps = await settingsService.getDeliveryOfferRadiusStepsKm();
    const radiusKm = radiusSteps[Math.min(radiusIndex, radiusSteps.length - 1)];

    const candidates = await deliveryRepository.findCandidateAgents(orderId);
    const ranked = await rankCandidatesBySellerEta(candidates, pickup, radiusKm);

    if (ranked.length === 0) {
        const nextRadiusIndex = radiusIndex + 1;

        if (nextRadiusIndex < radiusSteps.length) {
            logger.info(
                { orderId, radiusKm, nextRadiusKm: radiusSteps[nextRadiusIndex] },
                "no dispatch candidates in range - widening search radius"
            );
            // Phase 2 (Honest Status Transparency): lets the buyer's
            // tracking page/widget upgrade its "searching" copy the
            // moment we actually widen, instead of only guessing off a
            // client-side timer. Purely informational - nothing here
            // reads this event back, so a missed delivery (buyer's
            // socket briefly disconnected) never affects matching
            // itself, only how promptly the copy updates.
            socket().emitToOrder(orderId, "dispatch:still_searching", {
                orderId,
                phase: "widening",
                radiusKm,
                nextRadiusKm: radiusSteps[nextRadiusIndex]
            });
            return offerToNextCandidate(orderId, pickup, nextRadiusIndex);
        }

        logger.info({ orderId, radiusStepsKm: radiusSteps }, "no dispatch candidates at any configured radius - order left in manual pool");
        socket().emitToOrder(orderId, "dispatch:still_searching", {
            orderId,
            phase: "exhausted",
            radiusStepsKm: radiusSteps
        });
        return;
    }

    const nearest = ranked[0];
    const timeoutMs = await settingsService.getDeliveryOfferTimeoutMs();
    const expiresAt = new Date(Date.now() + timeoutMs);

    // Roadmap Phase 1: WhatsApp is preferred when configured (agents in
    // low-connectivity conditions may see a WhatsApp message land well
    // before/instead of an in-app push); SMS is the fallback for a
    // deployment with no WhatsApp integration active. Never both -
    // there's no per-agent "which channel do they actually have"
    // signal in the schema, so this is a deployment-level choice, not a
    // per-agent one. Either way this is purely additive: the in-app
    // socket event + web push below are unconditional, same as before
    // this phase.
    const externalChannel = whatsappProvider.isConfigured()
        ? "whatsapp"
        : (smsProvider.isConfigured() ? "sms" : null);

    const offerId = await deliveryRepository.createOffer(
        orderId,
        nearest.id,
        nearest.distanceKm,
        expiresAt,
        externalChannel
    );

    const order = await orderRepository.findOrderById(orderId);

    socket().emitToUser(nearest.id, "delivery:offer", {
        offerId,
        orderId,
        orderNumber: order.order_number,
        // Shop details the agent needs to go collect the order from —
        // the buyer's address matters once it's in hand, not before.
        pickupStoreName: pickup.storeName,
        pickupAddress: pickup.address,
        distanceToSellerKm: Math.round(nearest.distanceKm * 10) / 10,
        etaToSellerMinutes: nearest.etaMinutesToSeller ?? null,
        expiresInMs: timeoutMs
    });

    pushService
        .sendToUser(nearest.id, {
            title: "New pickup nearby",
            body: nearest.etaMinutesToSeller != null
                ? `${order.order_number} · ${Math.round(nearest.etaMinutesToSeller)} min to ${pickup.storeName || "the shop"}`
                : `${order.order_number} · ${Math.round(nearest.distanceKm * 10) / 10} km to ${pickup.storeName || "the shop"}`,
            offerId,
            orderId
        })
        .catch((err) => logger.warn({ err, offerId, orderId }, "push send error"));

    // Roadmap Phase 1: mirror the same offer as a WhatsApp/SMS text the
    // agent can reply to directly, for low-connectivity conditions where
    // the in-app push/socket event may not reach them promptly. Best
    // effort, fire-and-forget - same failure posture as the push send
    // just above, never blocks/breaks dispatch if it fails.
    if (nearest.phone && externalChannel) {
        const etaLine = nearest.etaMinutesToSeller != null
            ? `~${Math.round(nearest.etaMinutesToSeller)} min`
            : `${Math.round(nearest.distanceKm * 10) / 10} km`;
        const offerText =
            `New pickup offer - ${order.order_number}\n` +
            `Shop: ${pickup.storeName || "NEXORA seller"}\n` +
            `${etaLine} to the shop\n\n` +
            `Reply YES ${offerId} to accept, or NO ${offerId} to decline. ` +
            `Expires in ${Math.round(timeoutMs / 60000)} min.`;

        const provider = externalChannel === "whatsapp" ? whatsappProvider : smsProvider;
        provider
            .sendText(nearest.phone, offerText)
            .catch((err) => logger.warn({ err, offerId, orderId, externalChannel }, `${externalChannel} offer send error`));
    }

    await scheduleOfferExpiry(offerId, orderId, pickup, radiusIndex, timeoutMs);
};

// The actual expiry check, run either by the BullMQ worker (durable
// path) or the setTimeout fallback (non-durable, Redis-unconfigured
// path) - see scheduleOfferExpiry above. Exported as
// exports.handleOfferExpiryJob so server.js/worker.js can register it
// with queues/dispatchQueue.js#startDispatchWorker without that module
// needing to require this one back (would be a pointless indirection
// through the same layer that already owns getQueue()).
const handleOfferExpiryJob = async ({ offerId, orderId, pickup, radiusIndex }) => {
    const stillPending = await deliveryRepository.expireOffer(offerId);
    if (!stillPending) return; // already accepted/declined

    await offerToNextCandidate(orderId, pickup, radiusIndex);
};
exports.handleOfferExpiryJob = handleOfferExpiryJob;

// Derives which radius step a given offer was made within, from its
// recorded distance_km - candidates are always filtered to
// distanceKm <= radiusSteps[radiusIndex] when offered (see
// offerToNextCandidate), so the smallest step at or above that distance
// is always the step it was offered at. Used by declineOffer below to
// resume matching at the SAME radius the declined offer was made at,
// without needing a dedicated radius_index column on delivery_offers
// just to carry that one piece of state across a request.
const resolveRadiusIndexForDistance = (distanceKm, radiusSteps) => {
    const distance = Number(distanceKm);
    const index = radiusSteps.findIndex((km) => distance <= km);
    return index === -1 ? radiusSteps.length - 1 : index;
};

// responseChannel defaults to "app" (an in-app tap/socket event, the
// pre-existing behavior) - Roadmap Phase 1's WhatsApp/SMS reply handler
// (handleOfferReplyByPhone below) is the only other caller that passes
// "whatsapp"/"sms" explicitly. See migration 092.
exports.acceptOffer = async (offerId, agentId, responseChannel = "app") => {
    const offer = await deliveryRepository.findOfferById(offerId);
    if (!offer || offer.agent_id !== agentId) {
        throw new Error("Offer not found");
    }

    const existingDelivery = await deliveryRepository.findByOrderId(offer.order_id);
    if (existingDelivery) {
        throw new Error("This order has already been claimed");
    }

    const accepted = await deliveryRepository.acceptOffer(offerId, agentId, responseChannel);
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

exports.declineOffer = async (offerId, agentId, responseChannel = "app") => {
    const offer = await deliveryRepository.findOfferById(offerId);
    if (!offer || offer.agent_id !== agentId) {
        throw new Error("Offer not found");
    }

    await deliveryRepository.declineOffer(offerId, agentId, responseChannel);

    const order = await orderRepository.findOrderById(offer.order_id);
    if (order) {
        const pickup = await getSellerPickupPoint(order);
        if (pickup) {
            // Resume at the same radius this offer was made within,
            // rather than resetting to the smallest step - see
            // resolveRadiusIndexForDistance.
            const radiusSteps = await settingsService.getDeliveryOfferRadiusStepsKm();
            const radiusIndex = resolveRadiusIndexForDistance(offer.distance_km, radiusSteps);
            await offerToNextCandidate(offer.order_id, pickup, radiusIndex);
        }
    }
};

// ---- Roadmap Phase 1: offer accept/decline by WhatsApp/SMS reply ---------
//
// Called by both whatsapp.service.js (inbound Cloud API message) and
// sms.controller.js (inbound gateway webhook) with whatever raw text the
// agent sent. Returns:
//   - null when the text doesn't match the expected "YES <id>"/"NO <id>"
//     shape at all - callers treat this as "not an offer reply", e.g.
//     whatsapp.service.js falls through to its normal numbered-menu bot.
//   - a reply string otherwise (success confirmation, or a friendly
//     error - offer not found/already claimed/expired) - callers send
//     this back to the agent on whichever channel it arrived on.
//
// Deliberately channel-agnostic: it doesn't know or care whether it was
// reached over WhatsApp or SMS beyond the `channel` string it's asked to
// record as the offer's response_channel (migration 092).
const OFFER_REPLY_PATTERN = /^\s*(YES|NO)\s+(\d+)\s*$/i;

exports.handleOfferReplyByPhone = async (phone, rawText, channel) => {
    const match = OFFER_REPLY_PATTERN.exec(rawText || "");
    if (!match) return null;

    const accept = match[1].toUpperCase() === "YES";
    const offerId = Number(match[2]);

    const agent = await deliveryRepository.findAgentByPhone(phone);
    if (!agent) {
        return "This phone number isn't linked to a NEXORA delivery agent account.";
    }

    try {
        if (accept) {
            const { orderId } = await exports.acceptOffer(offerId, agent.id, channel);
            const order = await orderRepository.findOrderById(orderId);
            return `You're assigned! Head to collect ${order ? order.order_number : `order #${orderId}`}. Check the app for pickup details.`;
        }

        await exports.declineOffer(offerId, agent.id, channel);
        return "Got it - offer declined.";
    } catch (error) {
        // acceptOffer/declineOffer throw friendly, already-user-facing
        // messages ("Offer not found", "This offer has expired", "This
        // order has already been claimed") - safe to relay as-is.
        return error.message;
    }
};
