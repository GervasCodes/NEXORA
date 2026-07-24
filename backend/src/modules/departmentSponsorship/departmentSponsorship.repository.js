const db = require("../../config/db");

// Every write function accepts an optional `executor` (a pool or an
// in-flight transaction connection) so departmentSponsorship.service can
// run the wallet debit + campaign insert as a single atomic transaction,
// same pattern sponsorship.repository.js (Phase 8A) and
// featuredStore.repository.js (Phase 8B) already use.

exports.create = async (
    { sellerId, categoryId, dailyRate, days, totalCost, endsAt },
    executor = db
) => {
    const [result] = await executor.query(
        `INSERT INTO department_sponsorship_campaigns
        (seller_id, category_id, daily_rate, days, total_cost, ends_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [sellerId, categoryId, dailyRate, days, totalCost, endsAt]
    );
    return result.insertId;
};

exports.findById = async (id, executor = db) => {
    const [rows] = await executor.query(
        "SELECT * FROM department_sponsorship_campaigns WHERE id = ?",
        [id]
    );
    return rows[0];
};

// Row-locks the campaign so a cancel request and the expiry cron can't
// race each other into double-processing the same row.
exports.findByIdForUpdate = async (id, executor = db) => {
    const [rows] = await executor.query(
        "SELECT * FROM department_sponsorship_campaigns WHERE id = ? FOR UPDATE",
        [id]
    );
    return rows[0];
};

// Whether this seller already has a currently-running campaign for this
// department - blocked at creation time (see
// departmentSponsorship.service.js#createCampaign) so a seller can't
// accidentally pay twice for their own placement at once. This is purely
// a spend-guard, same reasoning as
// featuredStore.repository.js#hasActiveForSellerCategory - it does not
// stop a *different* seller from also sponsoring the same department (the
// homepage ranking treats the department as sponsored if any seller has an
// active campaign for it, see category.repository.js#findAllActiveWithSponsorship).
exports.hasActiveForSellerCategory = async (sellerId, categoryId, executor = db) => {
    const [rows] = await executor.query(
        `SELECT id FROM department_sponsorship_campaigns
        WHERE seller_id = ? AND category_id = ? AND status = 'active' AND ends_at > NOW()
        LIMIT 1`,
        [sellerId, categoryId]
    );
    return rows.length > 0;
};

exports.updateStatus = async (id, status, executor = db) => {
    await executor.query(
        "UPDATE department_sponsorship_campaigns SET status = ? WHERE id = ?",
        [status, id]
    );
};

exports.findBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT dsc.id, dsc.category_id, dsc.daily_rate, dsc.days, dsc.total_cost,
                dsc.status, dsc.starts_at, dsc.ends_at, dsc.created_at,
                c.name AS category_name, c.slug AS category_slug
        FROM department_sponsorship_campaigns dsc
        JOIN categories c ON c.id = dsc.category_id
        WHERE dsc.seller_id = ?
        ORDER BY (dsc.status = 'active') DESC, dsc.created_at DESC`,
        [sellerId]
    );
    return rows;
};

// Campaigns whose end date has passed but are still marked 'active' - the
// departmentSponsorshipExpiry cron job's work queue. Row-locked (FOR
// UPDATE) since the job runs in its own transaction per batch.
exports.findExpiredActive = async (executor = db) => {
    const [rows] = await executor.query(
        `SELECT dsc.id, dsc.seller_id, dsc.category_id, c.name AS category_name
        FROM department_sponsorship_campaigns dsc
        JOIN categories c ON c.id = dsc.category_id
        WHERE dsc.status = 'active' AND dsc.ends_at <= NOW()
        FOR UPDATE`
    );
    return rows;
};

// --- Admin oversight (read-only) ---------------------------------------

exports.findAll = async () => {
    const [rows] = await db.query(
        `SELECT dsc.id, dsc.seller_id, dsc.category_id, dsc.daily_rate, dsc.days, dsc.total_cost,
                dsc.status, dsc.starts_at, dsc.ends_at, dsc.created_at,
                c.name AS category_name, sp.store_name
        FROM department_sponsorship_campaigns dsc
        JOIN categories c ON c.id = dsc.category_id
        JOIN seller_profiles sp ON sp.user_id = dsc.seller_id
        ORDER BY (dsc.status = 'active') DESC, dsc.created_at DESC
        LIMIT 200`
    );
    return rows;
};
