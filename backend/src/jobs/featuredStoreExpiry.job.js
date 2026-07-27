

const featuredStoreService = require("../modules/featuredStore/featuredStore.service");

exports.run = async () => {
    const expiredCount = await featuredStoreService.expireDueCampaigns();

    if (expiredCount) {
        console.log(`[featuredStoreExpiry job] expired ${expiredCount} campaign(s)`);
    }
};
