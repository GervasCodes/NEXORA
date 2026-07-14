const db = require("../../config/db");

exports.createFlag = async ({ entityType, entityId, ruleCode, reason, severity }) => {
    await db.query(
        `INSERT INTO fraud_flags (entity_type, entity_id, rule_code, reason, severity)
        VALUES (?, ?, ?, ?, ?)`,
        [entityType, entityId, ruleCode, reason, severity]
    );
};

// Avoids duplicate flags if the same rule already flagged this exact
// entity and is still unresolved - e.g. a buyer placing several fast
// orders shouldn't produce 5 near-identical open flags.
exports.hasOpenFlag = async (entityType, entityId, ruleCode) => {
    const [rows] = await db.query(
        `SELECT id FROM fraud_flags
        WHERE entity_type = ? AND entity_id = ? AND rule_code = ? AND status = 'open'
        LIMIT 1`,
        [entityType, entityId, ruleCode]
    );
    return rows.length > 0;
};

exports.findOpen = async () => {
    const [rows] = await db.query(
        `SELECT f.*,
            CASE WHEN f.entity_type = 'order' THEN o.order_number ELSE NULL END AS order_number,
            CASE WHEN f.entity_type = 'order' THEN o.total_amount ELSE NULL END AS order_amount,
            CASE WHEN f.entity_type = 'order' THEN buyer.first_name ELSE seller.first_name END AS person_first_name,
            CASE WHEN f.entity_type = 'order' THEN buyer.last_name ELSE seller.last_name END AS person_last_name,
            CASE WHEN f.entity_type = 'order' THEN buyer.email ELSE seller.email END AS person_email
        FROM fraud_flags f
        LEFT JOIN orders o ON f.entity_type = 'order' AND o.id = f.entity_id
        LEFT JOIN users buyer ON f.entity_type = 'order' AND buyer.id = o.buyer_id
        LEFT JOIN users seller ON f.entity_type = 'seller' AND seller.id = f.entity_id
        WHERE f.status = 'open'
        ORDER BY f.severity = 'high' DESC, f.created_at DESC`
    );
    return rows;
};

exports.resolve = async (id, status, adminId) => {
    await db.query(
        `UPDATE fraud_flags SET status = ?, resolved_by = ?, resolved_at = NOW() WHERE id = ?`,
        [status, adminId, id]
    );
};

// --- Stats the rules need ---

// Buyer's order history BEFORE this one - used to detect "first order is
// suspiciously large" without needing anything beyond orders already in
// the table.
exports.getBuyerPriorOrderStats = async (buyerId) => {
    const [[stats]] = await db.query(
        `SELECT COUNT(*) AS prior_order_count, COALESCE(AVG(total_amount), 0) AS avg_amount
        FROM orders WHERE buyer_id = ?`,
        [buyerId]
    );
    return { priorOrderCount: Number(stats.prior_order_count), avgAmount: Number(stats.avg_amount) };
};

exports.countRecentOrdersByBuyer = async (buyerId, minutes) => {
    const [[{ count }]] = await db.query(
        `SELECT COUNT(*) AS count FROM orders
        WHERE buyer_id = ? AND created_at > (NOW() - INTERVAL ? MINUTE)`,
        [buyerId, minutes]
    );
    return Number(count);
};

// Seller's withdrawal history BEFORE this request - flags a request that's
// a sharp outlier vs their own normal pattern.
exports.getSellerPriorWithdrawalStats = async (sellerId) => {
    const [[stats]] = await db.query(
        `SELECT COUNT(*) AS prior_count, COALESCE(AVG(amount), 0) AS avg_amount
        FROM withdrawal_requests WHERE seller_id = ?`,
        [sellerId]
    );
    return { priorCount: Number(stats.prior_count), avgAmount: Number(stats.avg_amount) };
};
