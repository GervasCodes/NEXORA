const db = require("../../config/db");

// insertEarning still just records the earning - it starts 'held' by the
// column's own DEFAULT (see migration 120), no change needed here. What
// changed is what counts as this agent's "earnings" until it's released -
// see getTotals below.
exports.insertEarning = async (agentId, deliveryId, orderId, amount, executor = db) => {
    await executor.query(
        `INSERT INTO agent_earnings (agent_id, delivery_id, order_id, amount)
        VALUES (?, ?, ?, ?)`,
        [agentId, deliveryId, orderId, amount]
    );
};

// Rider earnings hold (Phase 2, P1): total_earnings/today_earnings/
// week_earnings/month_earnings now only count RELEASED earnings - the
// figure an agent could actually be paid out today. held_earnings is new
// (additive) and surfaces what's still waiting out the dispute window, so
// the agent isn't left wondering where a just-completed delivery's payout
// went.
exports.getTotals = async (agentId) => {
    const [[totals]] = await db.query(
        `SELECT
            COALESCE(SUM(CASE WHEN status = 'released' THEN amount ELSE 0 END), 0) AS total_earnings,
            COUNT(CASE WHEN status = 'released' THEN 1 END) AS total_deliveries,
            COALESCE(SUM(CASE WHEN status = 'released' AND DATE(created_at) = CURDATE() THEN amount ELSE 0 END), 0) AS today_earnings,
            COALESCE(SUM(CASE WHEN status = 'released' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN amount ELSE 0 END), 0) AS week_earnings,
            COALESCE(SUM(CASE WHEN status = 'released' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN amount ELSE 0 END), 0) AS month_earnings,
            COALESCE(SUM(CASE WHEN status = 'held' THEN amount ELSE 0 END), 0) AS held_earnings
        FROM agent_earnings
        WHERE agent_id = ?`,
        [agentId]
    );
    return totals;
};

// Daily totals for the last N days, for a simple earnings-over-time chart.
// Kept counting every earning regardless of held/released status - a chart
// of "when deliveries happened" is more useful here than one that jumps
// retroactively as earnings get released days later.
exports.getDailyBreakdown = async (agentId, days = 14) => {
    const [rows] = await db.query(
        `SELECT DATE(created_at) AS day, SUM(amount) AS amount, COUNT(*) AS deliveries
        FROM agent_earnings
        WHERE agent_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(created_at)
        ORDER BY day ASC`,
        [agentId, days]
    );
    return rows;
};

exports.findRecent = async (agentId, limit = 20) => {
    const [rows] = await db.query(
        `SELECT ae.id, ae.amount, ae.status, ae.created_at, ae.released_at, o.order_number, o.shipping_city
        FROM agent_earnings ae
        JOIN orders o ON o.id = ae.order_id
        WHERE ae.agent_id = ?
        ORDER BY ae.created_at DESC
        LIMIT ?`,
        [agentId, limit]
    );
    return rows;
};

// ---- Release sweep (Phase 2) -----------------------------------------------
// Held earnings past the hold window, for an order that isn't in an open
// dispute AND (delivered long enough ago OR the buyer already confirmed
// receipt - whichever comes first, matching the master prompt's "hold for
// the dispute window (or until buyer confirmation)"). Mirrors
// wallet.repository.js's own escrow-release query shape.
exports.findReleasable = async (holdDays) => {
    const [rows] = await db.query(
        `SELECT ae.id, ae.agent_id, ae.amount, ae.order_id
        FROM agent_earnings ae
        JOIN orders o ON o.id = ae.order_id
        WHERE ae.status = 'held'
            AND (o.buyer_confirmed_at IS NOT NULL OR ae.created_at <= DATE_SUB(NOW(), INTERVAL ? DAY))
            AND NOT EXISTS (
                SELECT 1 FROM disputes d
                WHERE d.order_id = ae.order_id AND d.status IN ('open', 'under_review')
            )`,
        [holdDays]
    );
    return rows;
};

exports.markReleased = async (id) => {
    await db.query("UPDATE agent_earnings SET status = 'released', released_at = NOW() WHERE id = ? AND status = 'held'", [id]);
};
