const authRepository = require("../modules/auth/auth.repository");

// A delivery agent account can log in immediately after registering, but
// can't go online, browse available orders, claim a delivery, or update
// delivery status until an admin approves the verification documents
// (owner photo, National/Voter ID, driver's license) submitted at
// registration - see database/migrations/026_account_verification.sql.
// Checked fresh against the database on every request, never trusted
// from the JWT, since approval/rejection can happen any time during the
// lifetime of a 7-day token.
module.exports = async (req, res, next) => {
    try {
        const user = await authRepository.findById(req.user.id);

        if (!user) {
            return res.status(401).json({ success: false, message: "Account not found." });
        }

        if (user.account_verification_status !== "approved") {
            const messages = {
                pending: "Your account is currently under review. Our team is verifying your information. You'll gain access to delivery features once verification is approved.",
                rejected: user.account_verification_rejection_reason
                    ? `Your verification was rejected: ${user.account_verification_rejection_reason}. Please contact support.`
                    : "Your verification was rejected. Please contact support.",
                not_required: "Your account isn't set up for deliveries yet."
            };

            return res.status(403).json({
                success: false,
                message: messages[user.account_verification_status] || messages.pending,
                account_verification_status: user.account_verification_status
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
