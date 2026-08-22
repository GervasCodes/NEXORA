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
        FROM orders WHERE buyer_id = ? AND parent_order_id IS NULL`,
        [buyerId]
    );
    return { priorOrderCount: Number(stats.prior_order_count), avgAmount: Number(stats.avg_amount) };
};

exports.countRecentOrdersByBuyer = async (buyerId, minutes) => {
    const [[{ count }]] = await db.query(
        `SELECT COUNT(*) AS count FROM orders
        WHERE buyer_id = ? AND parent_order_id IS NULL AND created_at > (NOW() - INTERVAL ? MINUTE)`,
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

// --- Dashboard queries (Phase Q9 - Admin anomaly-detection dashboard) ---
// Everything below is read-only aggregation over fraud_flags for the
// visualization/anomaly layer - none of it writes flags or changes the
// rules above.

// One row per calendar day a flag was raised, over the trailing window.
// Every status is included (not just 'open') since the trend chart is
// about raise-rate over time, not the current queue. Days with zero
// flags simply don't appear here - fraud.service.js fills the gaps so
// the series has one point per day.
exports.getDailyFlagCounts = async (days) => {
    const [rows] = await db.query(
        `SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM fraud_flags
        WHERE created_at > (NOW() - INTERVAL ? DAY)
        GROUP BY DATE(created_at)
        ORDER BY day ASC`,
        [days]
    );
    return rows.map((r) => ({ day: String(r.day).slice(0, 10), count: Number(r.count) }));
};

// Flag volume per rule over the trailing window - which abuse pattern is
// actually firing, and how often it's high severity.
exports.getRuleBreakdown = async (days) => {
    const [rows] = await db.query(
        `SELECT rule_code, COUNT(*) AS count,
            SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) AS high_count
        FROM fraud_flags
        WHERE created_at > (NOW() - INTERVAL ? DAY)
        GROUP BY rule_code
        ORDER BY count DESC`,
        [days]
    );
    return rows.map((r) => ({ ruleCode: r.rule_code, count: Number(r.count), highCount: Number(r.high_count) }));
};

// Current open queue by severity - pre-aggregated version of the same
// population AdminFraud.jsx's stats chips already count client-side.
exports.getOpenSeverityBreakdown = async () => {
    const [rows] = await db.query(
        `SELECT severity, COUNT(*) AS count FROM fraud_flags WHERE status = 'open' GROUP BY severity`
    );
    return rows.map((r) => ({ severity: r.severity, count: Number(r.count) }));
};

// Resolution outcomes over the trailing window - confirmed-vs-dismissed
// is the closest signal this data has to "are these rules finding real
// fraud", since NEXORA has no independent ground truth for a flag.
exports.getResolutionBreakdown = async (days) => {
    const [rows] = await db.query(
        `SELECT status, COUNT(*) AS count
        FROM fraud_flags
        WHERE status IN ('confirmed', 'dismissed') AND resolved_at > (NOW() - INTERVAL ? DAY)
        GROUP BY status`,
        [days]
    );
    return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
};

// Entities (orders/sellers) with the most flags ever raised against them.
// All-time, not windowed - a repeat offender should stay visible here
// even after their individual flags were resolved and dropped off the
// open queue.
exports.getTopFlaggedEntities = async (limit) => {
    const [rows] = await db.query(
        `SELECT f.entity_type, f.entity_id, COUNT(*) AS flag_count,
            SUM(CASE WHEN f.status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_count,
            MAX(f.created_at) AS last_flagged_at,
            MAX(CASE WHEN f.entity_type = 'order' THEN buyer.first_name ELSE seller.first_name END) AS person_first_name,
            MAX(CASE WHEN f.entity_type = 'order' THEN buyer.last_name ELSE seller.last_name END) AS person_last_name,
            MAX(CASE WHEN f.entity_type = 'order' THEN buyer.email ELSE seller.email END) AS person_email
        FROM fraud_flags f
        LEFT JOIN orders o ON f.entity_type = 'order' AND o.id = f.entity_id
        LEFT JOIN users buyer ON f.entity_type = 'order' AND buyer.id = o.buyer_id
        LEFT JOIN users seller ON f.entity_type = 'seller' AND seller.id = f.entity_id
        GROUP BY f.entity_type, f.entity_id
        ORDER BY flag_count DESC, last_flagged_at DESC
        LIMIT ?`,
        [limit]
    );
    return rows.map((r) => ({
        entityType: r.entity_type,
        entityId: r.entity_id,
        flagCount: Number(r.flag_count),
        confirmedCount: Number(r.confirmed_count),
        lastFlaggedAt: r.last_flagged_at,
        personName: [r.person_first_name, r.person_last_name].filter(Boolean).join(" ") || null,
        personEmail: r.person_email || null
    }));
};
