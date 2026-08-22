const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const requireApprovedDeliveryAgent = require("../../middleware/requireApprovedDeliveryAgent.middleware");
const requireVerificationFeePaid = require("../../middleware/requireVerificationFeePaid.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const { aiLimiter } = require("./ai.middleware");

const aiController = require("./ai.controller");
const {
    chatValidation,
    searchParseValidation,
    recommendationContextValidation,
    orderIdValidation,
    listingDraftValidation,
    marketingCopyValidation,
    serviceIdParamValidation,
    disputeIdParamValidation,
    forecastVerticalValidation
} = require("./ai.validator");

// Public - personalizes automatically for a signed-in buyer, same shape
// as GET /recommendations/for-me. Rate-limited per user/IP either way.
router.post("/chat", aiLimiter, chatValidation, validationMiddleware, aiController.chat);

router.post("/search/parse", aiLimiter, searchParseValidation, validationMiddleware, aiController.parseSearch);

router.get(
    "/recommendations/:context/explain",
    aiLimiter,
    recommendationContextValidation,
    validationMiddleware,
    aiController.explainRecommendations
);

// Requires auth - this is the one B1 endpoint that reads real,
// buyer-specific order data, so it needs a real signed-in buyer rather
// than the optional-auth shape the other three use.
router.post(
    "/orders/:id/explain",
    authMiddleware,
    authorize("buyer"),
    aiLimiter,
    orderIdValidation,
    validationMiddleware,
    aiController.explainOrderStatus
);

// --- Phase B2: seller/provider AI (draft-generation, no auto-execute) ---
// account-approval gates mirror the exact chains seller.routes.js /
// availability.routes.js already use for the equivalent non-AI
// endpoints - see requireApprovedSeller/requireVerificationFeePaid's own
// comments for why analytics specifically needs the extra fee gate.

router.post(
    "/seller/listing-draft",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    aiLimiter,
    listingDraftValidation,
    validationMiddleware,
    aiController.generateListingDraft
);

router.post(
    "/seller/marketing-copy",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    aiLimiter,
    marketingCopyValidation,
    validationMiddleware,
    aiController.generateMarketingCopy
);

router.get(
    "/seller/analytics/summary",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireVerificationFeePaid,
    aiLimiter,
    aiController.summarizeSellerAnalytics
);

// Phase Q8 (AI demand forecasting). Same auth/gating as the analytics
// summary right above it - a seller-facing advisory feature, same
// verification-fee-paid gate the rest of this seller AI surface uses.
router.get(
    "/seller/demand-forecast",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    requireVerificationFeePaid,
    aiLimiter,
    aiController.suggestRestockAndPricing
);

router.get(
    "/seller/services/:serviceId/availability-suggestion",
    authMiddleware,
    authorize("seller"),
    requireApprovedSeller,
    aiLimiter,
    serviceIdParamValidation,
    validationMiddleware,
    aiController.suggestAvailability
);

// --- Phase B2: delivery-agent assistant -----------------------------------

router.get(
    "/delivery/route",
    authMiddleware,
    authorize("delivery_agent"),
    requireApprovedDeliveryAgent,
    aiLimiter,
    aiController.explainDeliveryRoute
);

// --- Phase B3: Admin AI Copilot (advisory only, never auto-acts) --------
// Every route below requires a signed-in admin - no anonymous/optional-
// auth shape here, unlike B1's buyer-facing endpoints, since every one
// of these reads admin-only data (dispute detail, fraud queue, business
// metrics) or drafts an admin-only suggestion.

router.get(
    "/admin/disputes/:id/summary",
    authMiddleware,
    authorize("admin"),
    aiLimiter,
    disputeIdParamValidation,
    validationMiddleware,
    aiController.summarizeDispute
);

router.post(
    "/admin/disputes/:id/suggest-resolution",
    authMiddleware,
    authorize("admin"),
    aiLimiter,
    disputeIdParamValidation,
    validationMiddleware,
    aiController.suggestDisputeResolution
);

router.get(
    "/admin/fraud-flags/explain",
    authMiddleware,
    authorize("admin"),
    aiLimiter,
    aiController.explainFraudQueue
);

router.get(
    "/admin/analytics/forecast-explain",
    authMiddleware,
    authorize("admin"),
    aiLimiter,
    forecastVerticalValidation,
    validationMiddleware,
    aiController.explainForecast
);

router.get(
    "/admin/personalization/explain",
    authMiddleware,
    authorize("admin"),
    aiLimiter,
    aiController.explainPersonalizationHealth
);

module.exports = router;
