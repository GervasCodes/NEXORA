const cron = require("node-cron");

const staleOrdersJob = require("./staleOrders.job");
const otpCleanupJob = require("./otpCleanup.job");

// Wraps a job so one throwing/rejecting never kills the cron scheduler or
// crashes the process - it just logs and waits for the next tick.
const safeRun = (name, job) => async () => {
    try {
        await job.run();
    } catch (error) {
        console.error(`[jobs] ${name} failed:`, error.message);
    }
};

exports.startJobs = () => {
    // Every 15 minutes: close out orders/payments that have been sitting
    // unconfirmed too long.
    cron.schedule("*/15 * * * *", safeRun("staleOrders", staleOrdersJob));

    // Once a day at 03:00 server time: housekeeping, low traffic hour.
    cron.schedule("0 3 * * *", safeRun("otpCleanup", otpCleanupJob));

    console.log("[jobs] background jobs scheduled (staleOrders every 15min, otpCleanup daily at 03:00)");
};
