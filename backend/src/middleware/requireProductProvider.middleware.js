const sellerRepository = require("../modules/seller/seller.repository");

// Nexora Services - Permission Matrix (CHANGES.md): a pure Service
// Provider (seller_profiles.merchant_type === "service") is restricted
// from Products/Inventory/Shipping, the mirror image of
// requireServiceProvider.middleware.js restricting a pure Product
// Seller from Services/Bookings/Availability. Before this middleware,
// only the frontend (SellerLayout.jsx's tab gating) enforced that side
// of the matrix - a service-only seller's own dashboard already hid
// the Products tab and redirected direct navigation to it, but nothing
// stopped a direct API call from creating/managing products anyway.
// This closes that gap the same way the services side is already
// closed, reusing seller_profiles.merchant_type - no new role, table,
// or registration flow.
//
// Meant to run AFTER requireApprovedSeller in the route chain, same
// contract requireServiceProvider documents - this only adds the
// merchant-type check on top.
module.exports = async (req, res, next) => {
    try {
        const seller = await sellerRepository.findByUserId(req.user.id);

        if (!seller) {
            return res.status(400).json({
                success: false,
                message: "Set up your store profile first."
            });
        }

        if (seller.merchant_type !== "product" && seller.merchant_type !== "hybrid") {
            return res.status(403).json({
                success: false,
                message: "Your store isn't set up to sell products. Switch your merchant type to Products or Products & Services in your store settings first."
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
