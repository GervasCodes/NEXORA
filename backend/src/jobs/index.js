const cron = require("node-cron");
const { withLock } = require("../utils/dbLock");

const staleOrdersJob = require("./staleOrders.job");
const otpCleanupJob = require("./otpCleanup.job");
const sponsorshipExpiryJob = require("./sponsorshipExpiry.job");
const featuredStoreExpiryJob = require("./featuredStoreExpiry.job");
const departmentSponsorshipExpiryJob = require("./departmentSponsorshipExpiry.job");
const escrowReleaseJob = require("./escrowRelease.job");
const bookingLifecycleJob = require("./bookingLifecycle.job");
const departmentMaintenanceScheduleJob = require("./departmentMaintenanceSchedule.job");
const webhookReplayCleanupJob = require("./webhookReplayCleanup.job");
const monetizationScheduleJob = require("./monetizationSchedule.job");

// Wraps a job so one throwing/rejecting never kills the cron scheduler or
// crashes the process - it just logs and waits for the next tick. Also
// wraps the run in a MySQL advisory lock (see utils/dbLock.js) named
// after the job, so that if this scheduler ever runs from more than one
// process/replica at once (a horizontally-scaled worker - see worker.js
// and docs/SCALABILITY_REPORT.md), only one replica actually executes a
// given tick; the rest see the lock held and skip that tick silently.
// This is a no-op safety net in the common single-replica case (the
// lock is acquired and released on every tick with nothing to contend
// with) but makes future worker scaling safe without further changes
// here.
const safeRun = (name, job) => async () => {
    try {
        const { acquired } = await withLock(`nexora:job:${name}`, () => job.run());
        if (!acquired) {
            console.log(`[jobs] ${name} skipped this tick - lock held by another instance`);
        }
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

    // Every hour, on the hour: close out sponsorship campaigns whose paid
    // duration has ended and clear the display flag - see
    // sponsorshipExpiry.job.js and sponsorship.service.js#expireDueCampaigns.
    cron.schedule("0 * * * *", safeRun("sponsorshipExpiry", sponsorshipExpiryJob));

    // Every hour, on the hour: close out featured-store campaigns whose
    // paid duration has ended - see featuredStoreExpiry.job.js and
    // featuredStore.service.js#expireDueCampaigns. No display flag to
    // clear here (the ranking query joins the campaigns table live), so
    // this just keeps campaign `status` accurate for the seller/admin
    // campaign lists.
    cron.schedule("0 * * * *", safeRun("featuredStoreExpiry", featuredStoreExpiryJob));

    // Every hour, on the hour: close out department-sponsorship campaigns
    // whose paid duration has ended - see departmentSponsorshipExpiry.job.js
    // and departmentSponsorship.service.js#expireDueCampaigns. No display
    // flag to clear here either (the homepage ranking query joins the
    // campaigns table live), so this just keeps campaign `status` accurate
    // for the seller/admin campaign lists.
    cron.schedule("0 * * * *", safeRun("departmentSponsorshipExpiry", departmentSponsorshipExpiryJob));

    // Every hour, at 10 past: advance paid bookings through
    // confirmed -> active -> completed as their dates pass - see
    // bookingLifecycle.job.js. Scheduled before escrowRelease (15 past)
    // so a booking that completes this hour is already 'completed' by
    // the time that job's hold-day scan runs.
    cron.schedule("10 * * * *", safeRun("bookingLifecycle", bookingLifecycleJob));

    // Every hour, at 15 past: release seller earnings that are past their
    // escrow hold window - see escrowRelease.job.js and
    // wallet.service.js#releaseEligibleEarnings. Offset from the other
    // hourly jobs above (on the hour) purely so they don't all hit the DB
    // in the same instant; no ordering dependency between them.
    cron.schedule("15 * * * *", safeRun("escrowRelease", escrowReleaseJob));

    // Every minute: flip departments into/out of maintenance as their
    // scheduled windows arrive - see departmentMaintenanceSchedule.job.js
    // and category.service.js#applyDueMaintenanceSchedules.
    cron.schedule("* * * * *", safeRun("departmentMaintenanceSchedule", departmentMaintenanceScheduleJob));

    // Every minute: apply due monetization flag activations scheduled
    // from the Admin Billing Control Center - see
    // monetizationSchedule.job.js and monetizationSchedule.service.js
    // #applyDueSchedules. Same cadence/reasoning as
    // departmentMaintenanceSchedule above (a scheduled billing switch is
    // similarly time-sensitive to admins).
    cron.schedule("* * * * *", safeRun("monetizationSchedule", monetizationScheduleJob));

    // Once a day at 03:10 server time (just after otpCleanup, same low-
    // traffic housekeeping slot): prune webhook_replay_guard rows older
    // than the replay window matters for - see webhookReplayCleanup.job.js.
    cron.schedule("10 3 * * *", safeRun("webhookReplayCleanup", webhookReplayCleanupJob));

    console.log("[jobs] background jobs scheduled (staleOrders every 15min, otpCleanup daily at 03:00, webhookReplayCleanup daily at 03:10, sponsorshipExpiry hourly, featuredStoreExpiry hourly, departmentSponsorshipExpiry hourly, bookingLifecycle hourly, escrowRelease hourly, departmentMaintenanceSchedule every minute, monetizationSchedule every minute)");
};
