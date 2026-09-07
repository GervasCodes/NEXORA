const { body, param, query } = require("express-validator");

// Capped well below what a legitimate question needs, mainly to bound
// the token cost (and therefore spend-guard risk) of a single request.
// history is optional prior conversation turns - capped to the same 6
// messages ai.service.js#chat trims to server-side, each message's
// content capped at the same 1000-char limit as message itself.
exports.chatValidation = [
    body("message")
        .trim()
        .notEmpty().withMessage("Message is required")
        .isLength({ max: 1000 }).withMessage("Message is too long"),
    body("history")
        .optional()
        .isArray({ max: 6 }).withMessage("History must be an array of at most 6 messages"),
    body("history.*.role")
        .isIn(["user", "assistant"]).withMessage("Each history message must have role 'user' or 'assistant'"),
    body("history.*.content")
        .trim()
        .notEmpty().withMessage("Each history message must have content")
        .isLength({ max: 1000 }).withMessage("History message content is too long")
];

exports.searchParseValidation = [
    body("text")
        .trim()
        .notEmpty().withMessage("Search text is required")
        .isLength({ max: 300 }).withMessage("Search text is too long")
];

exports.recommendationContextValidation = [
    param("context").trim().notEmpty()
];

exports.orderIdValidation = [
    param("id").isInt({ min: 1 }).withMessage("Invalid order id")
];

// Phase 9: product/booking "ask about this" validators. Slug format
// mirrors product.routes.js's own param handling (no dedicated
// isSlug validator elsewhere in this codebase - a plain non-empty
// string is enough here since product.service.js#getProductBySlug
// itself is the authoritative "does this exist" check).
exports.productSlugValidation = [
    param("slug").trim().notEmpty().withMessage("Invalid product")
];

exports.bookingIdValidation = [
    param("id").isInt({ min: 1 }).withMessage("Invalid booking id")
];

// --- Phase B2 validators --------------------------------------------------

exports.listingDraftValidation = [
    body("type").isIn(["product", "service"]).withMessage("type must be 'product' or 'service'"),
    body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 200 }),
    body("category").optional().trim().isLength({ max: 100 }),
    body("keyFeatures").optional().trim().isLength({ max: 500 })
];

exports.marketingCopyValidation = [
    body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 200 }),
    body("audience").optional().trim().isLength({ max: 200 }),
    body("tone").optional().trim().isLength({ max: 50 }),
    body("keyPoints").optional().trim().isLength({ max: 500 })
];

exports.serviceIdParamValidation = [
    param("serviceId").isInt({ min: 1 }).withMessage("Invalid service id")
];

// --- Phase B3 validators ---------------------------------------------------

exports.disputeIdParamValidation = [
    param("id").isInt({ min: 1 }).withMessage("Invalid dispute id")
];

// Matches admin.service.js#getAnalytics / getServicesAnalytics - the
// only two verticals a forecast exists for. Anything else (including
// omitted) defaults to "products" in ai.service.js#explainForecast.
exports.forecastVerticalValidation = [
    query("vertical").optional().isIn(["products", "services"]).withMessage("vertical must be 'products' or 'services'")
];
