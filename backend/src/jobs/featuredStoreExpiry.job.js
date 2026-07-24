// Closes out featured-store campaigns whose paid duration has ended
// (Phase 8B). featuredStoreService.expireDueCampaigns() is idempotent -
// it only ever touches rows still marked 'active' with a past ends_at -
// so it's safe to run on every tick even if a previous run (or a manual
// retry) already handled everything. Same shape as
// sponsorshipExpiry.job.js (Phase 8A).

const featuredStoreService = require("../modules/featuredStore/featuredStore.service");

exports.run = async () => {
    const expiredCount = await featuredStoreService.expireDueCampaigns();

    if (expiredCount) {
        console.log(`[featuredStoreExpiry job] expired ${expiredCount} campaign(s)`);
    }
};
