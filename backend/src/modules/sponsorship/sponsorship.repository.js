const db = require("../../config/db");

// Every write function accepts an optional `executor` (a pool or an
// in-flight transaction connection) so sponsorship.service can run the
// wallet debit + campaign insert + product flag flip as a single atomic
// transaction, same pattern wallet.repository.js already uses for
// order-items + wallet + ledger writes.

exports.create = async (
    { sellerId, productId, dailyRate, days, totalCost, endsAt },
    executor = db
) => {
    const [result] = await executor.query(
        `INSERT INTO sponsorship_campaigns
        (seller_id, product_id, daily_rate, days, total_cost, ends_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [sellerId, productId, dailyRate, days, totalCost, endsAt]
    );
    return result.insertId;
};

exports.findById = async (id, executor = db) => {
    const [rows] = await executor.query(
        "SELECT * FROM sponsorship_campaigns WHERE id = ?",
        [id]
    );
    return rows[0];
};

// Row-locks the campaign so a cancel request and the expiry cron can't
// race each other into double-processing the same row.
exports.findByIdForUpdate = async (id, executor = db) => {
    const [rows] = await executor.query(
        "SELECT * FROM sponsorship_campaigns WHERE id = ? FOR UPDATE",
        [id]
    );
    return rows[0];
};

// Whether this product already has another campaign (any campaign other
// than `excludeId`) still actively sponsoring it - used so expiring one
// campaign doesn't clear is_sponsored out from under a second, still-
// running campaign for the same product.
exports.hasOtherActiveCampaign = async (productId, excludeId, executor = db) => {
    const [rows] = await executor.query(
        `SELECT id FROM sponsorship_campaigns
        WHERE product_id = ? AND id != ? AND status = 'active' AND ends_at > NOW()
        LIMIT 1`,
        [productId, excludeId]
    );
    return rows.length > 0;
};

exports.updateStatus = async (id, status, executor = db) => {
    await executor.query(
        "UPDATE sponsorship_campaigns SET status = ? WHERE id = ?",
        [status, id]
    );
};

exports.findBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT sc.id, sc.product_id, sc.daily_rate, sc.days, sc.total_cost,
                sc.status, sc.starts_at, sc.ends_at, sc.created_at,
                p.name AS product_name, p.slug AS product_slug
        FROM sponsorship_campaigns sc
        JOIN products p ON p.id = sc.product_id
        WHERE sc.seller_id = ?
        ORDER BY (sc.status = 'active') DESC, sc.created_at DESC`,
        [sellerId]
    );
    return rows;
};

// Campaigns whose end date has passed but are still marked 'active' -
// the sponsorshipExpiry cron job's work queue. Row-locked (FOR UPDATE)
// since the job runs in its own transaction per batch.
exports.findExpiredActive = async (executor = db) => {
    const [rows] = await executor.query(
        `SELECT sc.id, sc.seller_id, sc.product_id, p.name AS product_name
        FROM sponsorship_campaigns sc
        JOIN products p ON p.id = sc.product_id
        WHERE sc.status = 'active' AND sc.ends_at <= NOW()
        FOR UPDATE`
    );
    return rows;
};

// --- Admin oversight (read-only) ---------------------------------------

exports.findAll = async () => {
    const [rows] = await db.query(
        `SELECT sc.id, sc.seller_id, sc.product_id, sc.daily_rate, sc.days, sc.total_cost,
                sc.status, sc.starts_at, sc.ends_at, sc.created_at,
                p.name AS product_name, sp.store_name
        FROM sponsorship_campaigns sc
        JOIN products p ON p.id = sc.product_id
        JOIN seller_profiles sp ON sp.user_id = sc.seller_id
        ORDER BY (sc.status = 'active') DESC, sc.created_at DESC
        LIMIT 200`
    );
    return rows;
};
