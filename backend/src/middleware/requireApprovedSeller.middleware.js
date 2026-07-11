const sellerRepository = require("../modules/seller/seller.repository");

// A seller account can log in and set up its store profile immediately,
// but can't list or sell products until an admin approves their submitted
// verification documents (SRS "Seller Verification System"). This runs
// after authorize("seller") on any route that touches product listing.
module.exports = async (req, res, next) => {
    try {
        const seller = await sellerRepository.findByUserId(req.user.id);

        if (!seller) {
            return res.status(400).json({
                success: false,
                message: "Set up your store profile first."
            });
        }

        if (seller.verification_status !== "approved") {
            return res.status(403).json({
                success: false,
                message: seller.verification_status === "pending"
                    ? "Your seller verification is still under review. You can't add or sell products yet."
                    : seller.verification_status === "rejected"
                        ? "Your seller verification was rejected. Please resubmit your documents."
                        : "Submit your verification documents (National ID, Voter ID, business registration) before you can add or sell products.",
                verification_status: seller.verification_status
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
