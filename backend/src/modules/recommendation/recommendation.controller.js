const jwt = require("jsonwebtoken");
const recommendationService = require("./recommendation.service");

// These are public endpoints that personalize *if* the caller happens to
// be signed in, rather than requiring it (unlike every other buyer-only
// endpoint in this codebase, which goes through auth.middleware.js and
// rejects a missing/invalid token outright). A logged-out visitor still
// gets a useful (trending) result instead of a 401, so this decodes the
// token permissively rather than reusing auth.middleware.js.
const getOptionalBuyerId = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

    try {
        const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
        return decoded.role === "buyer" ? decoded.id : null;
    } catch {
        return null;
    }
};

exports.getForMe = async (req, res) => {
    try {
        const buyerId = getOptionalBuyerId(req);
        const data = await recommendationService.getForBuyer(buyerId);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getRelated = async (req, res) => {
    try {
        const data = await recommendationService.getRelatedToProduct(req.params.slug);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
