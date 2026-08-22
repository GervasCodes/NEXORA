const referralService = require("./referral.service");

exports.getMyStatus = async (req, res) => {
    try {
        const data = await referralService.getMyLoyaltyStatus(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
