const sponsorshipService = require("./sponsorship.service");

exports.getPricing = async (req, res) => {
    try {
        const pricing = await sponsorshipService.getPricing();

        return res.json({ success: true, data: pricing });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.createCampaign = async (req, res) => {
    try {
        const result = await sponsorshipService.createCampaign(
            req.user.id,
            req.body.product_id,
            req.body.days
        );

        return res.status(201).json({
            success: true,
            message: "Sponsorship campaign started",
            data: result
        });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getMyCampaigns = async (req, res) => {
    try {
        const campaigns = await sponsorshipService.getMyCampaigns(req.user.id);

        return res.json({ success: true, data: campaigns });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.cancelCampaign = async (req, res) => {
    try {
        const result = await sponsorshipService.cancelCampaign(req.user.id, req.params.id);

        return res.json({ success: true, message: "Campaign cancelled", data: result });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// --- Admin oversight ---
exports.listAllCampaigns = async (req, res) => {
    try {
        const campaigns = await sponsorshipService.listAllCampaigns();

        return res.json({ success: true, data: campaigns });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
