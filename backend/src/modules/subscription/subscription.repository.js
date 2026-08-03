const db = require("../../config/db");

// ---- Plans (public + admin) -------------------------------------------

exports.listActivePlans = async () => {
    const [rows] = await db.query(
        "SELECT * FROM subscription_plans WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC"
    );
    return rows;
};

exports.listAllPlans = async () => {
    const [rows] = await db.query(
        "SELECT * FROM subscription_plans ORDER BY sort_order ASC, id ASC"
    );
    return rows;
};

exports.findPlanById = async (planId, connection = db) => {
    const [rows] = await connection.query(
        "SELECT * FROM subscription_plans WHERE id = ?",
        [planId]
    );
    return rows[0];
};

exports.findPlanByCode = async (code) => {
    const [rows] = await db.query(
        "SELECT * FROM subscription_plans WHERE code = ?",
        [code]
    );
    return rows[0];
};

exports.createPlan = async (data) => {
    const [result] = await db.query(
        `INSERT INTO subscription_plans
            (code, name, description, price, billing_cycle, commission_rate_override, max_active_listings, features, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.code, data.name, data.description || null, data.price, data.billingCycle || "monthly",
            data.commissionRateOverride ?? null, data.maxActiveListings ?? null,
            data.features ? JSON.stringify(data.features) : null, data.sortOrder ?? 0
        ]
    );
    return result.insertId;
};

exports.updatePlan = async (planId, data) => {
    const fields = [];
    const values = [];

    const setIfPresent = (column, value) => {
        if (value !== undefined) {
            fields.push(`${column} = ?`);
            values.push(value);
        }
    };

    setIfPresent("name", data.name);
    setIfPresent("description", data.description);
    setIfPresent("price", data.price);
    setIfPresent("billing_cycle", data.billingCycle);
    setIfPresent("commission_rate_override", data.commissionRateOverride);
    setIfPresent("max_active_listings", data.maxActiveListings);
    if (data.features !== undefined) {
        fields.push("features = ?");
        values.push(data.features ? JSON.stringify(data.features) : null);
    }
    setIfPresent("sort_order", data.sortOrder);
    setIfPresent("is_active", data.isActive);

    if (fields.length === 0) return;

    values.push(planId);
    await db.query(`UPDATE subscription_plans SET ${fields.join(", ")} WHERE id = ?`, values);
};

// ---- Seller subscriptions ----------------------------------------------

// A seller's "current" subscription: the most recent row that is either
// still active-in-period, or the most recent row overall if none is
// currently active (so a lapsed/cancelled plan can still be shown as
// "your last plan" in the UI rather than nothing at all).
exports.findCurrentForSeller = async (sellerId) => {
    const [activeRows] = await db.query(
        `SELECT ss.*, sp.code AS plan_code, sp.name AS plan_name, sp.price, sp.billing_cycle,
                sp.commission_rate_override, sp.max_active_listings, sp.features
        FROM seller_subscriptions ss
        JOIN subscription_plans sp ON sp.id = ss.plan_id
        WHERE ss.seller_id = ? AND ss.status = 'active'
            AND (ss.current_period_end IS NULL OR ss.current_period_end >= NOW())
        ORDER BY ss.created_at DESC LIMIT 1`,
        [sellerId]
    );
    if (activeRows[0]) return activeRows[0];

    const [rows] = await db.query(
        `SELECT ss.*, sp.code AS plan_code, sp.name AS plan_name, sp.price, sp.billing_cycle,
                sp.commission_rate_override, sp.max_active_listings, sp.features
        FROM seller_subscriptions ss
        JOIN subscription_plans sp ON sp.id = ss.plan_id
        WHERE ss.seller_id = ?
        ORDER BY ss.created_at DESC LIMIT 1`,
        [sellerId]
    );
    return rows[0] || null;
};

exports.findPendingForSeller = async (sellerId, planId) => {
    const [rows] = await db.query(
        `SELECT * FROM seller_subscriptions
        WHERE seller_id = ? AND plan_id = ? AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1`,
        [sellerId, planId]
    );
    return rows[0];
};

exports.createSubscription = async (sellerId, planId, connection = db) => {
    const [result] = await connection.query(
        `INSERT INTO seller_subscriptions (seller_id, plan_id, status, auto_renew)
        VALUES (?, ?, 'pending', TRUE)`,
        [sellerId, planId]
    );
    return result.insertId;
};

exports.findById = async (subscriptionId, connection = db) => {
    const [rows] = await connection.query(
        "SELECT * FROM seller_subscriptions WHERE id = ?",
        [subscriptionId]
    );
    return rows[0];
};

// Called once payment for a subscription is confirmed. Activates it for
// one billing period from now, and supersedes any other active
// subscription the seller had (a seller has exactly one effective plan
// at a time - upgrading/downgrading closes the old row rather than
// leaving two "active" rows to reconcile).
exports.activateSubscription = async (subscriptionId, sellerId, billingCycle, connection = db) => {
    const periodDays = billingCycle === "annual" ? 365 : 30;

    await connection.query(
        `UPDATE seller_subscriptions
        SET status = 'cancelled', cancelled_at = NOW()
        WHERE seller_id = ? AND status = 'active' AND id != ?`,
        [sellerId, subscriptionId]
    );

    await connection.query(
        `UPDATE seller_subscriptions
        SET status = 'active', current_period_start = NOW(),
            current_period_end = DATE_ADD(NOW(), INTERVAL ${periodDays} DAY)
        WHERE id = ?`,
        [subscriptionId]
    );
};

exports.cancelSubscription = async (subscriptionId) => {
    await db.query(
        `UPDATE seller_subscriptions
        SET auto_renew = FALSE, cancelled_at = NOW()
        WHERE id = ?`,
        [subscriptionId]
    );
};

exports.countActiveListingsForSeller = async (sellerId) => {
    const [[productRow]] = await db.query(
        "SELECT COUNT(*) AS count FROM products WHERE seller_id = ? AND is_active = TRUE",
        [sellerId]
    );
    const [[serviceRow]] = await db.query(
        "SELECT COUNT(*) AS count FROM services WHERE provider_id = ? AND is_active = TRUE",
        [sellerId]
    );
    return Number(productRow.count) + Number(serviceRow.count);
};

exports.listAllSubscriptions = async () => {
    const [rows] = await db.query(
        `SELECT ss.*, sp.code AS plan_code, sp.name AS plan_name, sp.price,
                u.first_name, u.last_name, u.email
        FROM seller_subscriptions ss
        JOIN subscription_plans sp ON sp.id = ss.plan_id
        JOIN users u ON u.id = ss.seller_id
        ORDER BY ss.created_at DESC LIMIT 500`
    );
    return rows;
};
