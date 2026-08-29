const db = require("../../config/db");

// Fallback pool: orders that are ready for pickup but have no location
// (so can't be auto-matched) or whose offer queue ran out. Manual claim
// still works as a safety net.
exports.findAvailableForPickup = async () => {
    const [rows] = await db.query(
        `SELECT o.id AS order_id, o.order_number, o.shipping_address,
                o.shipping_city, o.shipping_region, o.total_amount
        FROM orders o
        LEFT JOIN deliveries d ON d.order_id = o.id
        WHERE o.status = 'shipped' AND d.id IS NULL AND o.delivery_mode = 'platform'
        ORDER BY o.created_at ASC`
    );
    return rows;
};

// Phase 1 (Durable Dispatch Foundation) - the periodic re-check job
// (jobs/deliveryRematch.job.js) sweeps this to retry matching for orders
// that landed in the manual pool with no active offer currently in
// flight. Same base shape as findAvailableForPickup above, with one more
// LEFT JOIN/NULL-check to exclude any order that already has a pending
// 'offered' row - those are mid-flow (waiting on an agent to
// accept/decline or on their offer to expire) and shouldn't have a
// second, competing match attempt started for them.
exports.findUnmatchedForRematch = async () => {
    const [rows] = await db.query(
        `SELECT o.id AS order_id
        FROM orders o
        LEFT JOIN deliveries d ON d.order_id = o.id
        LEFT JOIN delivery_offers off ON off.order_id = o.id AND off.status = 'offered'
        WHERE o.status = 'shipped' AND d.id IS NULL AND o.delivery_mode = 'platform' AND off.id IS NULL
        ORDER BY o.created_at ASC`
    );
    return rows;
};

exports.findByOrderId = async (orderId) => {
    const [rows] = await db.query(
        "SELECT * FROM deliveries WHERE order_id = ?",
        [orderId]
    );
    return rows[0];
};

// Same lookup as findByOrderId, but also brings back the assigned
// agent's vehicle info (migration 032) - used by delivery.service's
// getDelivery, so a buyer tracking their order can see what vehicle/
// plate number to expect, without a second round trip.
//
// Phase 1 (live order tracking) extends this with three more things the
// full tracking page needs on first load (before any socket event has
// arrived): the agent's last known position + when it was last updated,
// and the seller's pickup pin (LEFT JOINed - many sellers haven't set one
// yet, see migration 033) so the page can plot a pickup marker. All new
// columns are nullable and simply come back as null when unavailable.
exports.findByOrderIdWithAgent = async (orderId) => {
    const [rows] = await db.query(
        `SELECT d.*, u.first_name AS agent_first_name, u.last_name AS agent_last_name,
                u.phone AS agent_phone,
                u.vehicle_type AS agent_vehicle_type, u.vehicle_plate_number AS agent_vehicle_plate_number,
                u.current_lat AS agent_current_lat, u.current_lng AS agent_current_lng,
                u.location_updated_at AS agent_location_updated_at,
                sp.pickup_lat, sp.pickup_lng
        FROM deliveries d
        JOIN users u ON u.id = d.agent_id
        LEFT JOIN order_items oi ON oi.order_id = d.order_id
        LEFT JOIN seller_profiles sp ON sp.user_id = oi.seller_id
        WHERE d.order_id = ?
        LIMIT 1`,
        [orderId]
    );
    return rows[0];
};

// deliveryFee is a snapshot of the platform's current rider fee at the
// moment of assignment (see deliveryPricing.service's calculateDeliveryFee,
// or settingsService.getRiderDeliveryFee for the flat fallback), so later
// changes to pricing don't retroactively change what an agent is owed for
// a delivery already in progress. distanceKm is the distance that fee was
// actually calculated from (see migration 033) - null when the flat
// fallback fee was used instead, so an agent/admin can tell which one
// happened. durationMinutes (migration 039) is the road-routing travel
// time estimate for that same origin/destination at assignment time -
// also null under the flat fallback. It's a snapshot, not a live value:
// it's what "on-time" gets compared against later (see Phase 6's
// dispatch dashboard delay detection), so it deliberately doesn't get
// recalculated as the agent moves.
exports.create = async (
    orderId,
    agentId,
    deliveryFee = null,
    distanceKm = null,
    durationMinutes = null,
    routingProvider = null
) => {
    const [result] = await db.query(
        `INSERT INTO deliveries
            (order_id, agent_id, status, delivery_fee, distance_km, estimated_duration_minutes, routing_provider)
        VALUES (?, ?, 'assigned', ?, ?, ?, ?)`,
        [orderId, agentId, deliveryFee, distanceKm, durationMinutes, routingProvider]
    );
    return result.insertId;
};

// Flips earnings_credited only if it isn't already set, so a delivery can
// only ever generate one agent_earnings row. Returns true the one time it
// actually made the flip.
exports.markEarningsCredited = async (deliveryId) => {
    const [result] = await db.query(
        "UPDATE deliveries SET earnings_credited = TRUE WHERE id = ? AND earnings_credited = FALSE",
        [deliveryId]
    );
    return result.affectedRows > 0;
};

// Phase 5C: LEFT JOINs the agent's vehicle_type so callers (updateAgentLocation's
// live per-order ETA calculation) can pick the right OSRM profile without a
// second round trip. Nullable/optional like every other vehicle-type read in
// this module - a missing vehicle_type just falls back to routing's default
// profile (see routing config / osrm.provider.js).
exports.findByAgent = async (agentId) => {
    const [rows] = await db.query(
        `SELECT d.*, o.order_number, o.shipping_address, o.shipping_city,
                o.shipping_region, o.shipping_phone, o.delivery_lat, o.delivery_lng,
                u.vehicle_type AS agent_vehicle_type
        FROM deliveries d
        JOIN orders o ON o.id = d.order_id
        LEFT JOIN users u ON u.id = d.agent_id
        WHERE d.agent_id = ?
        ORDER BY d.assigned_at DESC`,
        [agentId]
    );
    return rows;
};

exports.updateStatus = async (deliveryId, status, notes) => {
    const deliveredAt = status === "delivered" ? new Date() : null;
    const pickedUpAt = status === "picked_up" ? new Date() : null;
    const inTransitAt = status === "in_transit" ? new Date() : null;

    await db.query(
        `UPDATE deliveries
        SET status = ?,
            notes = COALESCE(?, notes),
            picked_up_at = COALESCE(?, picked_up_at),
            in_transit_at = COALESCE(?, in_transit_at),
            delivered_at = COALESCE(?, delivered_at)
        WHERE id = ?`,
        [status, notes || null, pickedUpAt, inTransitAt, deliveredAt, deliveryId]
    );
};

// ---- Agent presence & location -------------------------------------------

exports.setOnlineStatus = async (agentId, isOnline) => {
    await db.query("UPDATE users SET is_online = ? WHERE id = ?", [isOnline, agentId]);
};

// Read path for shift-status persistence (see delivery.service.js#getAgentOnlineStatus) -
// lets the frontend hydrate its shift toggle on page load/reconnect
// instead of always defaulting to "off" until the next manual toggle.
exports.getOnlineStatus = async (agentId) => {
    const [rows] = await db.query("SELECT is_online FROM users WHERE id = ?", [agentId]);
    return !!rows[0]?.is_online;
};

exports.updateLocation = async (agentId, lat, lng) => {
    await db.query(
        `UPDATE users
        SET current_lat = ?, current_lng = ?, location_updated_at = NOW()
        WHERE id = ?`,
        [lat, lng, agentId]
    );
};

exports.findAgentLocation = async (agentId) => {
    const [rows] = await db.query(
        "SELECT current_lat, current_lng, location_updated_at FROM users WHERE id = ?",
        [agentId]
    );
    return rows[0];
};

// Online agents with a known location, who don't already have an active
// (not yet delivered/failed) delivery, and haven't already been offered
// this specific order. vehicle_type comes along so the smart-dispatch
// ranking (offerToNextCandidate in delivery.service.js) can request a
// road-routing ETA on the correct OSRM profile per agent, instead of
// treating every vehicle as a generic driving route.
exports.findCandidateAgents = async (orderId) => {
    const [rows] = await db.query(
        `SELECT u.id, u.first_name, u.phone, u.current_lat, u.current_lng, u.vehicle_type
        FROM users u
        WHERE u.role = 'delivery_agent'
          AND u.is_online = TRUE
          AND u.current_lat IS NOT NULL
          AND u.current_lng IS NOT NULL
          AND u.id NOT IN (
              SELECT agent_id FROM delivery_offers WHERE order_id = ?
          )
          AND u.id NOT IN (
              SELECT agent_id FROM deliveries
              WHERE status NOT IN ('delivered', 'failed')
          )`,
        [orderId]
    );
    return rows;
};

// Phase 3 (Admin Manual Override) - lets delivery.service.js's
// adminAssignDelivery verify the agent an admin picked from the dispatch
// board dropdown is actually a delivery agent and currently online,
// rather than trusting whatever id the request sent.
exports.findOnlineAgentById = async (agentId) => {
    const [rows] = await db.query(
        "SELECT id, is_online FROM users WHERE id = ? AND role = 'delivery_agent'",
        [agentId]
    );
    return rows[0];
};

// Roadmap Phase 2: batched read of each candidate's historical
// acceptance-rate (delivery_offers) and completion-rate (deliveries)
// stats, for the weighted scoring step in
// agentScoring.js#scoreCandidate. ONE query per stat (not one per
// agent) - agentIds is always a small pool (see
// ETA_CANDIDATE_POOL_SIZE in delivery.service.js), so this is cheap
// even called on every dispatch attempt. Returns a plain object keyed
// by agent id: { [agentId]: { acceptanceRate, completionRate } } -
// either rate is null when that agent has no relevant history yet
// (agentScoring.js falls back to a neutral default in that case, not
// this layer - this layer only reports what's actually known).
exports.findAgentPerformanceStats = async (agentIds) => {
    if (!agentIds || agentIds.length === 0) return {};

    const [[offerRows], [deliveryRows]] = await Promise.all([
        db.query(
            `SELECT agent_id,
                    SUM(status = 'accepted') AS accepted_count,
                    SUM(status IN ('accepted', 'declined', 'expired')) AS responded_count
            FROM delivery_offers
            WHERE agent_id IN (?)
            GROUP BY agent_id`,
            [agentIds]
        ),
        db.query(
            `SELECT agent_id,
                    SUM(status = 'delivered') AS delivered_count,
                    SUM(status IN ('delivered', 'failed')) AS completed_count
            FROM deliveries
            WHERE agent_id IN (?)
            GROUP BY agent_id`,
            [agentIds]
        )
    ]);

    const stats = {};
    for (const id of agentIds) {
        stats[id] = { acceptanceRate: null, completionRate: null };
    }

    for (const row of offerRows) {
        if (row.responded_count > 0) {
            stats[row.agent_id].acceptanceRate = row.accepted_count / row.responded_count;
        }
    }

    for (const row of deliveryRows) {
        if (row.completed_count > 0) {
            stats[row.agent_id].completionRate = row.delivered_count / row.completed_count;
        }
    }

    return stats;
};

// ---- Roadmap Phase 3: supply-side incentive nudges -------------------------

// Historical order volume for the CURRENT hour-of-day bucket, over the
// last `historyWindowDays` days - e.g. "how many orders typically land
// between 6pm-7pm" if it's currently 6:xx pm. Divides by the full
// window (not just days that happened to have an order) so a
// consistently-quiet hour correctly averages low rather than being
// skewed upward by ignoring its zero-order days - see
// jobs/supplyNudge.job.js for how this is turned into a per-online-
// agent ratio. HOUR(created_at) uses whatever timezone the DB
// connection is in, same as every other server-time-bucketed job in
// this codebase (see jobs/index.js's cron comments).
exports.countOrdersInCurrentHourBucket = async (historyWindowDays) => {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS order_count
        FROM orders
        WHERE created_at >= NOW() - INTERVAL ? DAY
          AND HOUR(created_at) = HOUR(NOW())`,
        [historyWindowDays]
    );
    return rows[0].order_count;
};

exports.countOnlineAgents = async () => {
    const [rows] = await db.query(
        "SELECT COUNT(*) AS agent_count FROM users WHERE role = 'delivery_agent' AND is_online = TRUE"
    );
    return rows[0].agent_count;
};

// "Eligible" mirrors the same account_verification_status gate every
// other delivery-agent-facing feature in this codebase respects (see
// migration 026) - an agent who hasn't been approved yet shouldn't be
// nudged to go online for a role they can't actually use yet.
exports.findOfflineEligibleAgents = async () => {
    const [rows] = await db.query(
        `SELECT id, phone FROM users
        WHERE role = 'delivery_agent'
          AND is_online = FALSE
          AND account_verification_status = 'approved'`
    );
    return rows;
};

// ---- Offer queue -----------------------------------------------------------

// Roadmap Phase 1: externalChannel records whether this offer was ALSO
// pushed via WhatsApp/SMS (in addition to the always-sent in-app socket
// event + push) - null when neither integration is configured. See
// migration 092.
exports.createOffer = async (orderId, agentId, distanceKm, expiresAt, externalChannel = null) => {
    const [result] = await db.query(
        `INSERT INTO delivery_offers (order_id, agent_id, status, distance_km, expires_at, external_channel)
        VALUES (?, ?, 'offered', ?, ?, ?)`,
        [orderId, agentId, distanceKm, expiresAt, externalChannel]
    );
    return result.insertId;
};

// Roadmap Phase 1: looks up a delivery agent by their phone number, for
// routing an inbound WhatsApp/SMS reply ("YES <offerId>"/"NO <offerId>")
// back to the account that offer actually belongs to - see
// delivery.service.js#handleOfferReplyByPhone.
exports.findAgentByPhone = async (phone) => {
    const [rows] = await db.query(
        "SELECT id, first_name, phone FROM users WHERE phone = ? AND role = 'delivery_agent'",
        [phone]
    );
    return rows[0];
};

exports.findActiveOffer = async (orderId) => {
    const [rows] = await db.query(
        `SELECT * FROM delivery_offers
        WHERE order_id = ? AND status = 'offered'
        ORDER BY offered_at DESC LIMIT 1`,
        [orderId]
    );
    return rows[0];
};

exports.findOfferById = async (offerId) => {
    const [rows] = await db.query("SELECT * FROM delivery_offers WHERE id = ?", [offerId]);
    return rows[0];
};

// Marks the offer as accepted, but only if it's still the pending one for
// that agent — guards against a stale/expired offer being accepted after
// the fact (e.g. the agent's accept click lands just after the timeout).
// responseChannel (migration 092) records how the agent responded -
// 'app' (the pre-existing default, an in-app tap) or 'whatsapp'/'sms'
// for a reply routed in via delivery.service.js#handleOfferReplyByPhone.
exports.acceptOffer = async (offerId, agentId, responseChannel = "app") => {
    const [result] = await db.query(
        `UPDATE delivery_offers
        SET status = 'accepted', responded_at = NOW(), response_channel = ?
        WHERE id = ? AND agent_id = ? AND status = 'offered'`,
        [responseChannel, offerId, agentId]
    );
    return result.affectedRows > 0;
};

exports.declineOffer = async (offerId, agentId, responseChannel = "app") => {
    await db.query(
        `UPDATE delivery_offers
        SET status = 'declined', responded_at = NOW(), response_channel = ?
        WHERE id = ? AND agent_id = ? AND status = 'offered'`,
        [responseChannel, offerId, agentId]
    );
};

// Only flips status if it's still 'offered' — if the agent accepted in the
// same window, this becomes a harmless no-op.
exports.expireOffer = async (offerId) => {
    const [result] = await db.query(
        `UPDATE delivery_offers
        SET status = 'expired', responded_at = NOW()
        WHERE id = ? AND status = 'offered'`,
        [offerId]
    );
    return result.affectedRows > 0;
};

// ---- Post-delivery ratings (migration 032) --------------------------------

exports.findRatingByOrder = async (orderId) => {
    const [rows] = await db.query(
        "SELECT * FROM delivery_ratings WHERE order_id = ?",
        [orderId]
    );
    return rows[0];
};

exports.createRating = async (orderId, agentId, buyerId, rating, comment) => {
    const [result] = await db.query(
        `INSERT INTO delivery_ratings (order_id, agent_id, buyer_id, rating, comment)
        VALUES (?, ?, ?, ?, ?)`,
        [orderId, agentId, buyerId, rating, comment || null]
    );
    return result.insertId;
};

exports.findRatingsByAgent = async (agentId) => {
    const [rows] = await db.query(
        `SELECT r.id, r.rating, r.comment, r.created_at, r.order_id,
                o.order_number
        FROM delivery_ratings r
        JOIN orders o ON o.id = r.order_id
        WHERE r.agent_id = ?
        ORDER BY r.created_at DESC`,
        [agentId]
    );
    return rows;
};

exports.getAgentRatingSummary = async (agentId) => {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS rating_count, AVG(rating) AS average_rating
        FROM delivery_ratings
        WHERE agent_id = ?`,
        [agentId]
    );
    return rows[0];
};
