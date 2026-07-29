const sellerRepository = require("../modules/seller/seller.repository");

// Nexora Services - Permission Matrix (CHANGES.md): a Product Seller is
// restricted from Services/Bookings/Availability until their
// seller_profiles.merchant_type includes services ('service' or
// 'hybrid' - migration 062). Meant to run AFTER requireApprovedSeller in
// the route chain (that middleware already confirms the account is
// approved and the store profile exists) - this only adds the
// merchant-type check on top, so it doesn't re-fetch/re-verify anything
// requireApprovedSeller already did.
module.exports = async (req, res, next) => {
    try {
        const seller = await sellerRepository.findByUserId(req.user.id);

        if (!seller) {
            return res.status(400).json({
                success: false,
                message: "Set up your store profile first."
            });
        }

        if (seller.merchant_type !== "service" && seller.merchant_type !== "hybrid") {
            return res.status(403).json({
                success: false,
                message: "Your store isn't set up to offer services. Switch your merchant type to Services or Products & Services in your store settings first."
            });
        }

        next();

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
