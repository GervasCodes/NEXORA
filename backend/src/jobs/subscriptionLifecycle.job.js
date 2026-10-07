// Daily subscription housekeeping (Phase 6): moves lapsed seller plans
// through past_due (grace) to expired, and sends the expiry reminder.
// Both steps are idempotent, so a missed or repeated run is harmless.
// Entitlements do not wait for this job - they are judged against NOW()
// in subscription.repository.js#findEntitledForSeller.

const subscriptionService = require("../modules/subscription/subscription.service");
const logger = require("../utils/logger").child({ module: "job:subscriptionLifecycle" });

exports.run = async () => {
    const sweep = await subscriptionService.runLifecycleSweep();
    const reminders = await subscriptionService.sendExpiryReminders();

    if (sweep.movedToPastDue || sweep.movedToExpired || reminders) {
        logger.info({ ...sweep, reminders }, "subscription lifecycle tick");
    }
};
