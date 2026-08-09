const db = require("../../config/db");

const VALID_KEYS = [
    "monetization_subscriptions_enabled",
    "monetization_commission_enabled",
    "monetization_sponsorship_enabled",
    "monetization_verification_fee_enabled"
];

exports.VALID_KEYS = VALID_KEYS;

exports.create = async (settingKey, scheduledValue, scheduledAt, createdBy) => {
    const [result] = await db.query(
        `INSERT INTO monetization_schedule (setting_key, scheduled_value, scheduled_at, created_by)
        VALUES (?, ?, ?, ?)`,
        [settingKey, scheduledValue ? 1 : 0, scheduledAt, createdBy || null]
    );
    return result.insertId;
};

// Every still-pending row (not yet applied, not cancelled), most
// recently scheduled first - what the Admin Billing Control Center
// lists so an admin can see/cancel upcoming changes.
exports.listPending = async () => {
    const [rows] = await db.query(
        `SELECT id, setting_key, scheduled_value, scheduled_at, created_by, created_at
        FROM monetization_schedule
        WHERE applied_at IS NULL AND cancelled_at IS NULL
        ORDER BY scheduled_at ASC`
    );
    return rows;
};

// Due, still-pending rows - what the every-minute cron job applies. Same
// idempotency shape as category.service.js#applyDueMaintenanceSchedules:
// only rows whose scheduled_at has actually passed and that haven't
// already been applied or cancelled.
exports.findDue = async () => {
    const [rows] = await db.query(
        `SELECT id, setting_key, scheduled_value
        FROM monetization_schedule
        WHERE applied_at IS NULL AND cancelled_at IS NULL AND scheduled_at <= NOW()`
    );
    return rows;
};

exports.markApplied = async (id) => {
    await db.query(`UPDATE monetization_schedule SET applied_at = NOW() WHERE id = ?`, [id]);
};

// Only ever called with one of the two literal column names below (never
// user input), so building the column name into the query text is safe.
const REMINDER_COLUMNS = ["reminder_3d_sent_at", "reminder_1d_sent_at"];

// Rows whose scheduled_at falls within `hoursBefore` hours from now,
// still pending (not applied/cancelled), and haven't had this specific
// reminder sent yet - what jobs/monetizationSchedule.job.js's
// sendDueReminders() pass fans a push notification out for. Gating on
// `${reminderColumn} IS NULL` is what makes this idempotent across the
// every-minute cron tick - once sent, the row falls out of this query
// for that reminder point permanently.
exports.findDueForReminder = async (reminderColumn, hoursBefore) => {
    if (!REMINDER_COLUMNS.includes(reminderColumn)) {
        throw new Error("Unknown reminder column");
    }
    const [rows] = await db.query(
        `SELECT id, setting_key, scheduled_value, scheduled_at
        FROM monetization_schedule
        WHERE applied_at IS NULL AND cancelled_at IS NULL
        AND ${reminderColumn} IS NULL
        AND scheduled_at > NOW()
        AND scheduled_at <= DATE_ADD(NOW(), INTERVAL ? HOUR)`,
        [hoursBefore]
    );
    return rows;
};

exports.markReminderSent = async (id, reminderColumn) => {
    if (!REMINDER_COLUMNS.includes(reminderColumn)) {
        throw new Error("Unknown reminder column");
    }
    await db.query(`UPDATE monetization_schedule SET ${reminderColumn} = NOW() WHERE id = ?`, [id]);
};

exports.findById = async (id) => {
    const [rows] = await db.query(`SELECT * FROM monetization_schedule WHERE id = ?`, [id]);
    return rows[0];
};

exports.cancel = async (id) => {
    await db.query(
        `UPDATE monetization_schedule SET cancelled_at = NOW() WHERE id = ? AND applied_at IS NULL AND cancelled_at IS NULL`,
        [id]
    );
};
