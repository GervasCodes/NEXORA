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
exports.findByOrderIdWithAgent = async (orderId) => {
    const [rows] = await db.query(
        `SELECT d.*, u.first_name AS agent_first_name, u.last_name AS agent_last_name,
                u.vehicle_type AS agent_vehicle_type, u.vehicle_plate_number AS agent_vehicle_plate_number
        FROM deliveries d
        JOIN users u ON u.id = d.agent_id
        WHERE d.order_id = ?`,
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
// happened.
exports.create = async (orderId, agentId, deliveryFee = null, distanceKm = null) => {
    const [result] = await db.query(
        `INSERT INTO deliveries (order_id, agent_id, status, delivery_fee, distance_km)
        VALUES (?, ?, 'assigned', ?, ?)`,
        [orderId, agentId, deliveryFee, distanceKm]
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

exports.findByAgent = async (agentId) => {
    const [rows] = await db.query(
        `SELECT d.*, o.order_number, o.shipping_address, o.shipping_city,
                o.shipping_region, o.shipping_phone, o.delivery_lat, o.delivery_lng
        FROM deliveries d
        JOIN orders o ON o.id = d.order_id
        WHERE d.agent_id = ?
        ORDER BY d.assigned_at DESC`,
        [agentId]
    );
    return rows;
};

exports.updateStatus = async (deliveryId, status, notes) => {
    const deliveredAt = status === "delivered" ? new Date() : null;

    await db.query(
        `UPDATE deliveries
        SET status = ?,
            notes = COALESCE(?, notes),
            delivered_at = COALESCE(?, delivered_at)
        WHERE id = ?`,
        [status, notes || null, deliveredAt, deliveryId]
    );
};

// ---- Agent presence & location -------------------------------------------

exports.setOnlineStatus = async (agentId, isOnline) => {
    await db.query("UPDATE users SET is_online = ? WHERE id = ?", [isOnline, agentId]);
};

exports.updateLocation = async (agentId, lat, lng) => {
    await db.query(
        `UPDATE users
        SET current_lat = ?, current_lng = ?, location_updated_at = NOW()
        WHERE id = ?`,
        [lat, lng, agentId]
    );
};

// Online agents with a known location, who don't already have an active
// (not yet delivered/failed) delivery, and haven't already been offered
// this specific order.
exports.findCandidateAgents = async (orderId) => {
    const [rows] = await db.query(
        `SELECT u.id, u.first_name, u.current_lat, u.current_lng
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

// ---- Offer queue -----------------------------------------------------------

exports.createOffer = async (orderId, agentId, distanceKm, expiresAt) => {
    const [result] = await db.query(
        `INSERT INTO delivery_offers (order_id, agent_id, status, distance_km, expires_at)
        VALUES (?, ?, 'offered', ?, ?)`,
        [orderId, agentId, distanceKm, expiresAt]
    );
    return result.insertId;
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
exports.acceptOffer = async (offerId, agentId) => {
    const [result] = await db.query(
        `UPDATE delivery_offers
        SET status = 'accepted', responded_at = NOW()
        WHERE id = ? AND agent_id = ? AND status = 'offered'`,
        [offerId, agentId]
    );
    return result.affectedRows > 0;
};

exports.declineOffer = async (offerId, agentId) => {
    await db.query(
        `UPDATE delivery_offers
        SET status = 'declined', responded_at = NOW()
        WHERE id = ? AND agent_id = ? AND status = 'offered'`,
        [offerId, agentId]
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
