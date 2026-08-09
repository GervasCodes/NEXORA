// Applies due monetization-flag activations scheduled from the Admin
// Billing Control Center (migration 079) - e.g. "enable subscriptions on
// 1 January 2027 at 00:00". Same idempotent, every-minute pattern as
// departmentMaintenanceSchedule.job.js: monetizationScheduleService
// .applyDueSchedules() only ever touches rows whose scheduled_at has
// actually passed and haven't already been applied/cancelled, so it's
// safe to run on every tick.

const monetizationScheduleService = require("../modules/monetizationSchedule/monetizationSchedule.service");

exports.run = async () => {
    const appliedCount = await monetizationScheduleService.applyDueSchedules();
    const reminderCount = await monetizationScheduleService.sendDueReminders();

    if (appliedCount) {
        console.log(`[monetizationSchedule job] applied ${appliedCount} scheduled change(s)`);
    }
    if (reminderCount) {
        console.log(`[monetizationSchedule job] sent ${reminderCount} billing reminder(s)`);
    }
};
