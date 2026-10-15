const authRepository = require("../auth/auth.repository");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");

// "Business tools only" accounts (migration 146) are seller-role users with
// users.seller_mode = 'business_tools'. The mode is read fresh from the
// database on every request, never from the JWT, so a conversion to a
// marketplace seller takes effect immediately on a still-valid token.

const loadUser = async (req, res) => {
    const user = await authRepository.findById(req.user.id);
    if (!user) {
        res.status(401).json({ success: false, message: "Account not found." });
        return null;
    }
    return user;
};

// Business tooling (POS) is open to two kinds of seller account: a
// tools-only account (no marketplace review needed), or a marketplace
// seller who has passed the usual approved-seller checks.
exports.requireBusinessToolsAccess = async (req, res, next) => {
    try {
        const user = await loadUser(req, res);
        if (!user) return undefined;

        if (user.seller_mode === "business_tools") {
            req.sellerMode = "business_tools";
            return next();
        }

        req.sellerMode = "marketplace";
        return requireApprovedSeller(req, res, next);
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// Only a tools-only account manages its inventory through the POS item
// endpoints; marketplace sellers use their normal product catalog.
exports.requireToolsOnlyAccount = async (req, res, next) => {
    try {
        const user = await loadUser(req, res);
        if (!user) return undefined;

        if (user.seller_mode !== "business_tools") {
            return res.status(403).json({
                success: false,
                message: "Manage your products from your seller product catalog."
            });
        }
        return next();
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// Marketplace-only actions (e.g. creating a public store profile) are not
// available to a tools-only account until it converts.
exports.blockToolsOnlyAccount = async (req, res, next) => {
    try {
        const user = await loadUser(req, res);
        if (!user) return undefined;

        if (user.seller_mode === "business_tools") {
            return res.status(403).json({
                success: false,
                code: "BUSINESS_TOOLS_ONLY",
                message: "This is a marketplace feature. Upgrade to a marketplace seller account to use it."
            });
        }
        return next();
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
