// Closes out department-sponsorship campaigns whose paid duration has
// ended (Phase 8C). departmentSponsorshipService.expireDueCampaigns() is
// idempotent - it only ever touches rows still marked 'active' with a
// past ends_at - so it's safe to run on every tick even if a previous run
// (or a manual retry) already handled everything. Same shape as
// sponsorshipExpiry.job.js (Phase 8A) and featuredStoreExpiry.job.js
// (Phase 8B).

const departmentSponsorshipService = require("../modules/departmentSponsorship/departmentSponsorship.service");

exports.run = async () => {
    const expiredCount = await departmentSponsorshipService.expireDueCampaigns();

    if (expiredCount) {
        console.log(`[departmentSponsorshipExpiry job] expired ${expiredCount} campaign(s)`);
    }
};
