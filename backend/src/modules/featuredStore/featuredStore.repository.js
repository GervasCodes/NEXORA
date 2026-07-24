const db = require("../../config/db");

// Every write function accepts an optional `executor` (a pool or an
// in-flight transaction connection) so featuredStore.service can run the
// wallet debit + campaign insert as a single atomic transaction, same
// pattern sponsorship.repository.js (Phase 8A) already uses.

exports.create = async (
    { sellerId, categoryId, dailyRate, days, totalCost, endsAt },
    executor = db
) => {
    const [result] = await executor.query(
        `INSERT INTO store_featured_campaigns
        (seller_id, category_id, daily_rate, days, total_cost, ends_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [sellerId, categoryId, dailyRate, days, totalCost, endsAt]
    );
    return result.insertId;
};

exports.findById = async (id, executor = db) => {
    const [rows] = await executor.query(
        "SELECT * FROM store_featured_campaigns WHERE id = ?",
        [id]
    );
    return rows[0];
};

// Row-locks the campaign so a cancel request and the expiry cron can't
// race each other into double-processing the same row.
exports.findByIdForUpdate = async (id, executor = db) => {
    const [rows] = await executor.query(
        "SELECT * FROM store_featured_campaigns WHERE id = ? FOR UPDATE",
        [id]
    );
    return rows[0];
};

// Whether this seller already has a currently-running campaign for this
// department - blocked at creation time (see
// featuredStore.service.js#createCampaign) so a seller can't accidentally
// pay twice for the same placement at once. Unlike
// sponsorship.repository.js#hasOtherActiveCampaign, this isn't needed to
// keep a shared flag in sync (there is none here - the ranking query
// joins this table live), it's purely a spend-guard.
exports.hasActiveForSellerCategory = async (sellerId, categoryId, executor = db) => {
    const [rows] = await executor.query(
        `SELECT id FROM store_featured_campaigns
        WHERE seller_id = ? AND category_id = ? AND status = 'active' AND ends_at > NOW()
        LIMIT 1`,
        [sellerId, categoryId]
    );
    return rows.length > 0;
};

exports.updateStatus = async (id, status, executor = db) => {
    await executor.query(
        "UPDATE store_featured_campaigns SET status = ? WHERE id = ?",
        [status, id]
    );
};

exports.findBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT sfc.id, sfc.category_id, sfc.daily_rate, sfc.days, sfc.total_cost,
                sfc.status, sfc.starts_at, sfc.ends_at, sfc.created_at,
                c.name AS category_name, c.slug AS category_slug
        FROM store_featured_campaigns sfc
        JOIN categories c ON c.id = sfc.category_id
        WHERE sfc.seller_id = ?
        ORDER BY (sfc.status = 'active') DESC, sfc.created_at DESC`,
        [sellerId]
    );
    return rows;
};

// Campaigns whose end date has passed but are still marked 'active' -
// the featuredStoreExpiry cron job's work queue. Row-locked (FOR UPDATE)
// since the job runs in its own transaction per batch.
exports.findExpiredActive = async (executor = db) => {
    const [rows] = await executor.query(
        `SELECT sfc.id, sfc.seller_id, sfc.category_id, c.name AS category_name
        FROM store_featured_campaigns sfc
        JOIN categories c ON c.id = sfc.category_id
        WHERE sfc.status = 'active' AND sfc.ends_at <= NOW()
        FOR UPDATE`
    );
    return rows;
};

// --- Admin oversight (read-only) ---------------------------------------

exports.findAll = async () => {
    const [rows] = await db.query(
        `SELECT sfc.id, sfc.seller_id, sfc.category_id, sfc.daily_rate, sfc.days, sfc.total_cost,
                sfc.status, sfc.starts_at, sfc.ends_at, sfc.created_at,
                c.name AS category_name, sp.store_name
        FROM store_featured_campaigns sfc
        JOIN categories c ON c.id = sfc.category_id
        JOIN seller_profiles sp ON sp.user_id = sfc.seller_id
        ORDER BY (sfc.status = 'active') DESC, sfc.created_at DESC
        LIMIT 200`
    );
    return rows;
};
