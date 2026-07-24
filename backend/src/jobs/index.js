const cron = require("node-cron");

const staleOrdersJob = require("./staleOrders.job");
const otpCleanupJob = require("./otpCleanup.job");
const sponsorshipExpiryJob = require("./sponsorshipExpiry.job");
const featuredStoreExpiryJob = require("./featuredStoreExpiry.job");
const departmentSponsorshipExpiryJob = require("./departmentSponsorshipExpiry.job");
const escrowReleaseJob = require("./escrowRelease.job");

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

    // Every hour, at 15 past: release seller earnings that are past their
    // escrow hold window - see escrowRelease.job.js and
    // wallet.service.js#releaseEligibleEarnings. Offset from the other
    // hourly jobs above (on the hour) purely so they don't all hit the DB
    // in the same instant; no ordering dependency between them.
    cron.schedule("15 * * * *", safeRun("escrowRelease", escrowReleaseJob));

    console.log("[jobs] background jobs scheduled (staleOrders every 15min, otpCleanup daily at 03:00, sponsorshipExpiry hourly, featuredStoreExpiry hourly, departmentSponsorshipExpiry hourly, escrowRelease hourly)");
};
