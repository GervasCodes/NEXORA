const featuredStoreService = require("./featuredStore.service");

exports.getPricing = async (req, res) => {
    try {
        const pricing = await featuredStoreService.getPricing();

        return res.json({ success: true, data: pricing });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getEligibleCategories = async (req, res) => {
    try {
        const categories = await featuredStoreService.getEligibleCategories(req.user.id);

        return res.json({ success: true, data: categories });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.createCampaign = async (req, res) => {
    try {
        const result = await featuredStoreService.createCampaign(
            req.user.id,
            req.body.category_id,
            req.body.days
        );

        return res.status(201).json({
            success: true,
            message: "Featured store campaign started",
            data: result
        });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getMyCampaigns = async (req, res) => {
    try {
        const campaigns = await featuredStoreService.getMyCampaigns(req.user.id);

        return res.json({ success: true, data: campaigns });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.cancelCampaign = async (req, res) => {
    try {
        const result = await featuredStoreService.cancelCampaign(req.user.id, req.params.id);

        return res.json({ success: true, message: "Campaign cancelled", data: result });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// --- Admin oversight ---
exports.listAllCampaigns = async (req, res) => {
    try {
        const campaigns = await featuredStoreService.listAllCampaigns();

        return res.json({ success: true, data: campaigns });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
