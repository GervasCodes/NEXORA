const sellerRepository = require("../modules/seller/seller.repository");
const settingsService = require("../modules/settings/settings.service");

// Sibling to requireApprovedSeller - gates the paid "Verified Seller"
// features (currently just Analytics) behind the one-time verification
// fee, on top of (not instead of) account approval. Always run
// requireApprovedSeller first: this middleware assumes a seller profile
// already exists and doesn't re-check account_verification_status
// itself.
//
// Returns a structured 403 (rather than just a message) so the frontend
// can render its own payment/verification page inline instead of a
// generic error - see SellerAnalytics.jsx.
module.exports = async (req, res, next) => {
    try {
        const seller = await sellerRepository.findByUserId(req.user.id);

        if (!seller) {
            return res.status(400).json({
                success: false,
                message: "Set up your store profile first."
            });
        }

        if (!seller.verification_fee_paid) {
            // Monetization Master Switch: while verification-fee
            // monetization is off, nobody should be blocked behind a fee
            // that isn't actually being charged - let the request through
            // rather than 403ing sellers who haven't (and can't yet)
            // pay it. seller.service.js#payVerificationFee still waives
            // and marks it paid the next time they hit that endpoint, but
            // this middleware doesn't require that to have happened yet.
            const verificationFeeEnabled = await settingsService.isVerificationFeeMonetizationEnabled();
            if (!verificationFeeEnabled) {
                return next();
            }

            const requiredFee = await settingsService.getVerificationFee();

            return res.status(403).json({
                success: false,
                code: "VERIFICATION_FEE_REQUIRED",
                message: "Pay the one-time verification fee to unlock this feature.",
                required_fee: requiredFee
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
