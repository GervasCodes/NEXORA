const db = require("../../config/db");

// Every write function accepts an optional `executor` (a pool or an
// in-flight transaction connection) so departmentSponsorship.service can
// run the wallet debit + campaign insert as a single atomic transaction,
// same pattern sponsorship.repository.js (Phase 8A) and
// featuredStore.repository.js  already use.

exports.create = async (
    { sellerId, categoryId, dailyRate, days, totalCost, creditsUsed = 0, endsAt },
    executor = db
) => {
    const [result] = await executor.query(
        `INSERT INTO department_sponsorship_campaigns
        (seller_id, category_id, daily_rate, days, total_cost, credits_used, ends_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sellerId, categoryId, dailyRate, days, totalCost, creditsUsed, endsAt]
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

// Ends this seller's stale 'active' campaign in one department if its end
// date has passed (status-conditional). Keeps the unique key from being hit
// by a campaign the sweep has not reached yet.
exports.expireStaleForSellerCategory = async (sellerId, categoryId, executor = db) => {
    await executor.query(
        `UPDATE department_sponsorship_campaigns
        SET status = 'expired'
        WHERE seller_id = ? AND category_id = ? AND status = 'active' AND ends_at <= NOW()`,
        [sellerId, categoryId]
    );
};

// Conditional on the row still being 'active' and past its end date.
exports.expireIfDue = async (id, executor = db) => {
    const [result] = await executor.query(
        `UPDATE department_sponsorship_campaigns
        SET status = 'expired'
        WHERE id = ? AND status = 'active' AND ends_at <= NOW()`,
        [id]
    );
    return result.affectedRows > 0;
};

exports.findExpiredActiveIds = async () => {
    const [rows] = await db.query(
        `SELECT dsc.id, dsc.seller_id, c.name AS category_name
        FROM department_sponsorship_campaigns dsc
        JOIN categories c ON c.id = dsc.category_id
        WHERE dsc.status = 'active' AND dsc.ends_at <= NOW()`
    );
    return rows;
};

// Conditional: only flips a row still 'active', so a cancel that loses a race
// with the expiry sweep is reported, not swallowed.
exports.markCancelled = async (id, { refundAmount, creditDaysReturned }, executor = db) => {
    const [result] = await executor.query(
        `UPDATE department_sponsorship_campaigns
        SET status = 'cancelled', refund_amount = ?, credit_days_returned = ?, cancelled_at = NOW()
        WHERE id = ? AND status = 'active'`,
        [refundAmount, creditDaysReturned, id]
    );
    return result.affectedRows > 0;
};

exports.updateStatus = async (id, status, executor = db) => {
    await executor.query(
        "UPDATE department_sponsorship_campaigns SET status = ? WHERE id = ?",
        [status, id]
    );
};

exports.findBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT dsc.id, dsc.category_id, dsc.daily_rate, dsc.days, dsc.total_cost, dsc.credits_used,
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
        `SELECT dsc.id, dsc.seller_id, dsc.category_id, dsc.daily_rate, dsc.days, dsc.total_cost, dsc.credits_used,
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
