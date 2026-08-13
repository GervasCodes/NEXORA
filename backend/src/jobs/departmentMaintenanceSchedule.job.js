// Applies due department maintenance schedule transitions (migration 069).
// categoryService.applyDueMaintenanceSchedules() is idempotent - it only
// ever touches rows whose scheduled start/end has actually passed - so
// it's safe to run on every tick even if a previous run (or a manual
// admin action in between) already handled a given department. Runs
// every minute rather than hourly like most other jobs here, since a
// maintenance window's start/end time is user-facing and admins expect
// it to take effect close to the minute they picked.

const categoryService = require("../modules/category/category.service");
const logger = require("../utils/logger").child({ module: "job:departmentMaintenanceSchedule" });

exports.run = async () => {
    const appliedCount = await categoryService.applyDueMaintenanceSchedules();

    if (appliedCount) {
        logger.info({ appliedCount }, "applied transition(s)");
    }
};
