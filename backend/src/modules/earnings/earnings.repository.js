const db = require("../../config/db");

exports.insertEarning = async (agentId, deliveryId, orderId, amount, executor = db) => {
    await executor.query(
        `INSERT INTO agent_earnings (agent_id, delivery_id, order_id, amount)
        VALUES (?, ?, ?, ?)`,
        [agentId, deliveryId, orderId, amount]
    );
};

exports.getTotals = async (agentId) => {
    const [[totals]] = await db.query(
        `SELECT
            COALESCE(SUM(amount), 0) AS total_earnings,
            COUNT(*) AS total_deliveries,
            COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN amount ELSE 0 END), 0) AS today_earnings,
            COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN amount ELSE 0 END), 0) AS week_earnings,
            COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN amount ELSE 0 END), 0) AS month_earnings
        FROM agent_earnings
        WHERE agent_id = ?`,
        [agentId]
    );
    return totals;
};

// Daily totals for the last N days, for a simple earnings-over-time chart.
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
        `SELECT ae.id, ae.amount, ae.created_at, o.order_number, o.shipping_city
        FROM agent_earnings ae
        JOIN orders o ON o.id = ae.order_id
        WHERE ae.agent_id = ?
        ORDER BY ae.created_at DESC
        LIMIT ?`,
        [agentId, limit]
    );
    return rows;
};
