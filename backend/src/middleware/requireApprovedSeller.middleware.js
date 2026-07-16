const sellerRepository = require("../modules/seller/seller.repository");
const authRepository = require("../modules/auth/auth.repository");

// A seller account can log in immediately, but every seller feature
// (product management, orders, analytics, etc.) stays disabled until:
//   1) the account-level verification submitted at registration
//      (owner photo/selfie + National ID or Voter ID) has been approved
//      by an admin, and
//   2) their store profile has been set up.
// Re-reads the account's verification status fresh from the database on
// every request (never trusts the JWT for this) since it can change at
// any time - a 7-day-old token shouldn't still say "pending" after an
// admin approved the account five minutes ago, and it shouldn't still
// say "approved" after a rejection either.
module.exports = async (req, res, next) => {
    try {
        const user = await authRepository.findById(req.user.id);

        if (!user) {
            return res.status(401).json({ success: false, message: "Account not found." });
        }

        if (user.account_verification_status !== "approved") {
            const messages = {
                pending: "Your account is currently under review. Our team is verifying your information. You'll gain access to seller features once verification is approved.",
                rejected: user.account_verification_rejection_reason
                    ? `Your verification was rejected: ${user.account_verification_rejection_reason}. Please contact support.`
                    : "Your verification was rejected. Please contact support.",
                not_required: "Your account isn't set up for seller verification. Please contact support."
            };

            return res.status(403).json({
                success: false,
                message: messages[user.account_verification_status] || messages.pending,
                account_verification_status: user.account_verification_status
            });
        }

        const seller = await sellerRepository.findByUserId(req.user.id);

        if (!seller) {
            return res.status(400).json({
                success: false,
                message: "Set up your store profile first."
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
