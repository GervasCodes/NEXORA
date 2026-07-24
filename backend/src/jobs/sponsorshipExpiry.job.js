// Closes out sponsorship campaigns whose paid duration has ended (Phase
// 8A). sponsorshipService.expireDueCampaigns() is idempotent - it only
// ever touches rows still marked 'active' with a past ends_at - so it's
// safe to run on every tick even if a previous run (or a manual retry)
// already handled everything.

const sponsorshipService = require("../modules/sponsorship/sponsorship.service");

exports.run = async () => {
    const expiredCount = await sponsorshipService.expireDueCampaigns();

    if (expiredCount) {
        console.log(`[sponsorshipExpiry job] expired ${expiredCount} campaign(s)`);
    }
};
