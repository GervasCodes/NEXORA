// Daily subscription housekeeping (Phase 6): moves lapsed seller plans
// through past_due (grace) to expired, sends the expiry reminder, and
// sends the free-trial notices (day 5, last day, expired).
// Both steps are idempotent, so a missed or repeated run is harmless.
// Entitlements do not wait for this job - they are judged against NOW()
// in subscription.repository.js#findEntitledForSeller.

const subscriptionService = require("../modules/subscription/subscription.service");
const trialService = require("../modules/subscription/trial.service");
const logger = require("../utils/logger").child({ module: "job:subscriptionLifecycle" });

exports.run = async () => {
    const sweep = await subscriptionService.runLifecycleSweep();
    const reminders = await subscriptionService.sendExpiryReminders();
    const trialNotices = await trialService.sendLifecycleNotifications();

    if (sweep.movedToPastDue || sweep.movedToExpired || reminders || trialNotices) {
        logger.info({ ...sweep, reminders, trialNotices }, "subscription lifecycle tick");
    }
};
