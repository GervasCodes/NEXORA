const jwt = require("jsonwebtoken");
const aiService = require("./ai.service");

// Chat/search/recommendations personalize if the caller happens to be
// signed in but don't require it - same reasoning and same permissive-
// decode shape as recommendation.controller.js#getOptionalBuyerId.
const getOptionalUserId = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

    try {
        const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
        return decoded.id || null;
    } catch {
        return null;
    }
};

exports.chat = async (req, res) => {
    try {
        const userId = getOptionalUserId(req);
        const result = await aiService.chat({ userId, message: req.body.message });
        res.json({ success: true, data: result });
    } catch (error) {
        // A genuinely broken request path shouldn't happen here (the
        // service itself never throws for "AI unavailable" - only a
        // real bug would reach this branch), but this still must not
        // leave the buyer with nothing to look at.
        res.status(500).json({ success: false, message: "Nexora AI is temporarily unavailable." });
    }
};

exports.parseSearch = async (req, res) => {
    try {
        const userId = getOptionalUserId(req);
        const result = await aiService.parseSearchQuery({ userId, text: req.body.text });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: "Nexora AI is temporarily unavailable." });
    }
};

exports.explainRecommendations = async (req, res) => {
    try {
        const userId = getOptionalUserId(req);
        // A route param of "for-me" means the buyer's personal feed;
        // anything else is treated as a product slug for "related to
        // this product" - matches the two recommendationService entry
        // points (getForBuyer / getRelatedToProduct).
        const forProductSlug = req.params.context === "for-me" ? null : req.params.context;
        const result = await aiService.explainRecommendations({ userId, forProductSlug });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: "Nexora AI is temporarily unavailable." });
    }
};

exports.explainOrderStatus = async (req, res) => {
    try {
        // req.user is required here (route is behind authMiddleware +
        // authorize("buyer")) - order.service.js#getOrderDetail is what
        // actually enforces this buyer owns the order, same as
        // order.controller.js#getOrderDetail. That function throws a
        // plain "Order not found" Error (no missing/wrong order id ever
        // reaches a provider call) - order.controller.js's own
        // getOrderDetail treats any error from it as a 404, so this
        // does the same rather than masking a bad id as a generic
        // "AI unavailable" 500.
        const result = await aiService.explainOrderStatus({ userId: req.user.id, orderId: req.params.id });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(404).json({ success: false, message: error.message });
    }
};

// --- Phase B2: seller/provider AI (draft-generation, no auto-execute) ---
// Every route these sit behind requires auth (see ai.routes.js) - none
// of these personalize for an anonymous caller the way B1's public
// endpoints do.

exports.generateListingDraft = async (req, res) => {
    try {
        const { type, name, category, keyFeatures } = req.body;
        const result = await aiService.generateListingDraft({ userId: req.user.id, type, name, category, keyFeatures });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: "Nexora AI is temporarily unavailable." });
    }
};

exports.generateMarketingCopy = async (req, res) => {
    try {
        const { name, audience, tone, keyPoints } = req.body;
        const result = await aiService.generateMarketingCopy({ userId: req.user.id, name, audience, tone, keyPoints });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: "Nexora AI is temporarily unavailable." });
    }
};

exports.summarizeSellerAnalytics = async (req, res) => {
    try {
        const result = await aiService.summarizeSellerAnalytics({ userId: req.user.id });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: "Nexora AI is temporarily unavailable." });
    }
};

exports.suggestRestockAndPricing = async (req, res) => {
    try {
        const result = await aiService.suggestRestockAndPricing({ userId: req.user.id });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: "Nexora AI is temporarily unavailable." });
    }
};

exports.suggestAvailability = async (req, res) => {
    try {
        const result = await aiService.suggestAvailability({ userId: req.user.id, serviceId: req.params.serviceId });
        res.json({ success: true, data: result });
    } catch (error) {
        // Mirrors availability.controller.js: a bad/unowned service id
        // is a 404, not a generic AI-unavailable 500.
        res.status(404).json({ success: false, message: error.message });
    }
};

exports.explainDeliveryRoute = async (req, res) => {
    try {
        const result = await aiService.explainDeliveryRoute({ userId: req.user.id });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: "Nexora AI is temporarily unavailable." });
    }
};

// --- Phase B3: Admin AI Copilot (advisory only, never auto-acts) --------
// Every route these sit behind requires authMiddleware + authorize("admin")
// (see ai.routes.js) - none of these write to a dispute, fraud flag, or
// any other admin-managed record; the admin still acts through the same
// existing controls as before this phase.

exports.summarizeDispute = async (req, res) => {
    try {
        const result = await aiService.summarizeDispute({ userId: req.user.id, disputeId: req.params.id });
        res.json({ success: true, data: result });
    } catch (error) {
        // Mirrors dispute.controller.js#getDetail: a bad/missing dispute
        // id is a 400 with the real error message, not a generic
        // AI-unavailable 500.
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.explainFraudQueue = async (req, res) => {
    try {
        const result = await aiService.explainFraudQueue({ userId: req.user.id });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: "Nexora AI is temporarily unavailable." });
    }
};

exports.explainForecast = async (req, res) => {
    try {
        const result = await aiService.explainForecast({ userId: req.user.id, vertical: req.query.vertical });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: "Nexora AI is temporarily unavailable." });
    }
};

exports.explainPersonalizationHealth = async (req, res) => {
    try {
        const result = await aiService.explainPersonalizationHealth({ userId: req.user.id });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: "Nexora AI is temporarily unavailable." });
    }
};

exports.suggestDisputeResolution = async (req, res) => {
    try {
        const result = await aiService.suggestDisputeResolution({ userId: req.user.id, disputeId: req.params.id });
        res.json({ success: true, data: result });
    } catch (error) {
        // Same reasoning as summarizeDispute above - a bad id or a
        // wrong-status dispute (already resolved/rejected/withdrawn)
        // returns its real message, not a generic 500.
        res.status(400).json({ success: false, message: error.message });
    }
};
