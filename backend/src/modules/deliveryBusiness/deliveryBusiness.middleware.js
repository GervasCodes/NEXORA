const deliveryBusinessRepository = require("./deliveryBusiness.repository");

// Loads the caller's delivery business and attaches it as req.business.
// Looked up fresh per request (never from the JWT) so a business can't be
// acted on through a stale token, and ownership is always the caller's own.
module.exports = async (req, res, next) => {
    try {
        const business = await deliveryBusinessRepository.findByOwner(req.user.id);
        if (!business) {
            return res.status(403).json({
                success: false,
                code: "NO_DELIVERY_BUSINESS",
                message: "Set up your delivery business first."
            });
        }
        req.business = business;
        next();
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
