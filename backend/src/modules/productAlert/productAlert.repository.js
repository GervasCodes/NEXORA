const db = require("../../config/db");

// Phase 5 (UI/UX remediation) - back-in-stock / price-drop alerts.
// See migration 096's comment on product_alerts' shape.

exports.subscribe = async (userId, productId, alertType, priceBaseline = null) => {
    await db.query(
        `INSERT INTO product_alerts (user_id, product_id, alert_type, price_baseline)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            price_baseline = VALUES(price_baseline),
            notified_at = NULL`,
        [userId, productId, alertType, priceBaseline]
    );
};

exports.unsubscribe = async (userId, productId, alertType) => {
    await db.query(
        "DELETE FROM product_alerts WHERE user_id = ? AND product_id = ? AND alert_type = ?",
        [userId, productId, alertType]
    );
};

// Used by ProductDetail.jsx to show the alert toggle in its already-
// subscribed state.
exports.findSubscriptions = async (userId, productId) => {
    const [rows] = await db.query(
        "SELECT alert_type FROM product_alerts WHERE user_id = ? AND product_id = ?",
        [userId, productId]
    );
    return rows.map((r) => r.alert_type);
};

// Every not-yet-fired subscription of a given type for a product - the
// set of buyers to notify when stock/price actually changes.
exports.findPendingForProduct = async (productId, alertType) => {
    const [rows] = await db.query(
        "SELECT * FROM product_alerts WHERE product_id = ? AND alert_type = ? AND notified_at IS NULL",
        [productId, alertType]
    );
    return rows;
};

exports.markNotified = async (ids) => {
    if (!ids.length) return;
    await db.query(
        "UPDATE product_alerts SET notified_at = NOW() WHERE id IN (?)",
        [ids]
    );
};
