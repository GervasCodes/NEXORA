const db = require("../../config/db");

// All trial timing is decided in SQL (NOW()), never by comparing a JS clock
// to a DATETIME, so the app server and the database can never disagree
// about whether a trial is over.

exports.findTrialForUser = async (userId, connection = db) => {
    const [rows] = await connection.query(
        `SELECT id, role, trial_started_at, trial_ends_at, trial_reminder_stage,
                (trial_ends_at IS NOT NULL AND trial_ends_at > NOW()) AS in_trial,
                CASE WHEN trial_ends_at IS NOT NULL AND trial_ends_at > NOW()
                     THEN CEIL(TIMESTAMPDIFF(SECOND, NOW(), trial_ends_at) / 86400)
                     ELSE 0 END AS days_left
         FROM users WHERE id = ?`,
        [userId]
    );
    return rows[0] || null;
};

// Push the trial end date out by N days. If the trial already ended, the
// extension counts from now (not from the old end date), so extending an
// expired trial by 3 days gives 3 days from today. The reminder stage is
// reset so the day-5 / day-7 / expired notices fire again for the new window.
exports.extendTrial = async (userId, days) => {
    const [result] = await db.query(
        `UPDATE users
         SET trial_started_at = COALESCE(trial_started_at, NOW()),
             trial_ends_at = GREATEST(COALESCE(trial_ends_at, NOW()), NOW()) + INTERVAL ? DAY,
             trial_reminder_stage = 0
         WHERE id = ? AND role = 'seller'`,
        [days, userId]
    );
    return result.affectedRows > 0;
};

// Lifecycle sweep queries. Each stage is claimed with a conditional UPDATE
// (claimStage), so a repeated run or a second worker never double-notifies.

// Trial users whose day-5 point (2 days or fewer left) has been reached.
exports.findDueForDay5 = async () => {
    const [rows] = await db.query(
        `SELECT id AS user_id, trial_ends_at FROM users
         WHERE role = 'seller' AND trial_reminder_stage < 1
           AND trial_ends_at > NOW()
           AND trial_ends_at <= NOW() + INTERVAL 2 DAY`
    );
    return rows;
};

// Trial users on the last day (24 hours or fewer left) - "day 7".
exports.findDueForDay7 = async () => {
    const [rows] = await db.query(
        `SELECT id AS user_id, trial_ends_at FROM users
         WHERE role = 'seller' AND trial_reminder_stage < 2
           AND trial_ends_at > NOW()
           AND trial_ends_at <= NOW() + INTERVAL 1 DAY`
    );
    return rows;
};

exports.findExpired = async () => {
    const [rows] = await db.query(
        `SELECT id AS user_id, trial_ends_at FROM users
         WHERE role = 'seller' AND trial_reminder_stage < 3
           AND trial_ends_at IS NOT NULL AND trial_ends_at <= NOW()`
    );
    return rows;
};

// Moves the stage forward only. Returns true for the one caller that
// actually advanced it.
exports.claimStage = async (userId, stage) => {
    const [result] = await db.query(
        "UPDATE users SET trial_reminder_stage = ? WHERE id = ? AND trial_reminder_stage < ?",
        [stage, userId, stage]
    );
    return result.affectedRows > 0;
};
