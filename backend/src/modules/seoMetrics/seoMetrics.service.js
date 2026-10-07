const repository = require("./seoMetrics.repository");

// Collapses a raw URL path into a route pattern so the table never stores
// slugs, ids or query strings (low cardinality, nothing personal).
const ROUTE_PATTERNS = [
    [/^\/products\/[^/]+$/, "/products/:slug"],
    [/^\/services\/category\/[^/]+$/, "/services/category/:slug"],
    [/^\/services\/[^/]+$/, "/services/:slug"],
    [/^\/stores\/[^/]+$/, "/stores/:slug"],
    [/^\/departments\/[^/]+$/, "/departments/:slug"],
    [/^\/guides\/[^/]+$/, "/guides/:slug"],
    [/^\/legal\/[^/]+$/, "/legal/:slug"],
    [/^\/group-buys\/[^/]+$/, "/group-buys/:id"],
    [/^\/orders\/[^/]+(\/tracking)?$/, "/orders/:id"],
    [/^\/(seller|admin|delivery)(\/.*)?$/, "/$1"],
    [/^\/messages\/[^/]+$/, "/messages/:id"]
];

exports.toRoutePattern = (rawPath) => {
    const path = String(rawPath || "/").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
    for (const [regex, pattern] of ROUTE_PATTERNS) {
        const match = path.match(regex);
        if (match) return pattern.replace("$1", match[1] || "").slice(0, 120);
    }
    return path.slice(0, 120);
};

// Search terms are stored lower-cased and whitespace-collapsed, so
// "Red  Shoes" and "red shoes" count as one.
exports.normalizeTerm = (term) => String(term || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);

exports.recordVital = (payload) =>
    repository.insertVital({
        metric: payload.metric,
        value: Number(payload.value),
        rating: payload.rating,
        route: exports.toRoutePattern(payload.path),
        device: payload.device === "mobile" ? "mobile" : "desktop"
    });

exports.recordSearchMiss = ({ term, scope }) => {
    const normalized = exports.normalizeTerm(term);
    if (normalized.length < 2) return null;
    return repository.bumpSearchMiss({ scope: scope === "services" ? "services" : "products", term: normalized });
};

exports.listSearchMisses = (limit = 100) => repository.listSearchMisses(limit);
exports.summarizeVitals = (days = 7) => repository.summarizeVitals(days);
exports.deleteOldVitals = (days = 90) => repository.deleteOldVitals(days);
