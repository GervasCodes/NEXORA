const searchRepository = require("./search.repository");
const cache = require("../../utils/cache");

const CACHE_NAMESPACE = "searchTrending";
const TRENDING_WINDOW_DAYS = 7;
const TRENDING_LIMIT = 8;
const MIN_TERM_LENGTH = 2;
const MAX_TERM_LENGTH = 100;

const normalize = (term) => (term || "").trim().toLowerCase().slice(0, MAX_TERM_LENGTH);

// Fire-and-forget from the controller - a logging failure must never surface
// to the shopper or slow down their search. Terms below the same 2-char
// floor SearchBox already applies, or over the length cap, are silently
// dropped rather than stored. Anonymous by design (no user_id) - search is
// public and trending should reflect every shopper, logged in or not.
exports.logQuery = async (rawTerm) => {
    const term = (rawTerm || "").trim().slice(0, MAX_TERM_LENGTH);
    const normalizedTerm = normalize(term);
    if (normalizedTerm.length < MIN_TERM_LENGTH) return;

    await searchRepository.logQuery(term, normalizedTerm);
};

// Cached for several minutes - trending is inherently a "roughly right"
// number, not something that needs read-after-write freshness (same
// reasoning as category.service.js's department/home-highlights caching).
exports.getTrending = async () => {
    return cache.getOrSet(CACHE_NAMESPACE, "top", async () => {
        const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const rows = await searchRepository.findTrending(since, TRENDING_LIMIT);
        return rows.map((r) => r.normalized_term);
    }, 300);
};
