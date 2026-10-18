// Length of the automatic seller free trial, in days. The migration 147
// backfill uses the same 7.
exports.TRIAL_DAYS = 7;

// Lifecycle notification stages stored in users.trial_reminder_stage.
exports.TRIAL_STAGE = {
    NONE: 0,
    DAY_5: 1,
    DAY_7: 2,
    EXPIRED: 3
};
