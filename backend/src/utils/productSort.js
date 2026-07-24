// Phase 3C: sort-order logic for the public product listing, pulled out
// of product.repository.js so it's unit-testable without a database -
// same pattern as utils/productSearch.js and utils/productFilters.js.
//
// Sort options are a small, fixed whitelist rather than free-form SQL:
// the raw query param is only ever used as a lookup key into
// SORT_CLAUSES below, never interpolated into a query string directly,
// so there's no injection surface here regardless of what a caller
// sends.
//
// "rating" sorts on the same `average_rating` SELECT alias the listing
// already computes (see product.repository.js) rather than repeating the
// subquery - ORDER BY (unlike WHERE) can reference a SELECT list alias
// in MySQL. Products with no reviews have a NULL average_rating, and
// MySQL treats NULL as the lowest possible value, so DESC order already
// puts unrated products last without any extra CASE/IS NULL handling.
const SORT_CLAUSES = {
    newest: "p.created_at DESC",
    price_low: "COALESCE(p.discount_price, p.price) ASC, p.created_at DESC",
    price_high: "COALESCE(p.discount_price, p.price) DESC, p.created_at DESC",
    rating: "average_rating DESC, review_count DESC, p.created_at DESC"
};

const VALID_SORTS = Object.keys(SORT_CLAUSES);

// Accepts a raw (untrusted, string-or-undefined) sort key and returns it
// only if it's one of the whitelisted options above, or null otherwise -
// null means "no explicit sort was requested," not "sort by nothing";
// buildOrderByClause below falls back to a sensible default for null.
function parseSort(raw) {
    if (raw === undefined || raw === null || raw === "") return null;

    const value = String(raw);
    return VALID_SORTS.includes(value) ? value : null;
}

// Builds the ORDER BY clause (without the "ORDER BY" keywords) for
// product.repository.js#findAll.
//
// - An explicit, valid `sort` always wins, whether or not a search is
//   active - picking "Price: low to high" while searching should sort
//   the matching products by price, not silently keep relevance order.
// - With no explicit sort and an active FULLTEXT search
//   (`hasRelevance`), relevance is the default - "relevance DESC" was
//   already the pre-3C default the moment a search term existed, and
//   this only takes over when the caller didn't ask for anything more
//   specific.
// - Otherwise, newest-first, the platform's original default.
function buildOrderByClause(sort, hasRelevance) {
    if (sort && SORT_CLAUSES[sort]) {
        return SORT_CLAUSES[sort];
    }

    if (hasRelevance) {
        return "relevance DESC, p.created_at DESC";
    }

    return SORT_CLAUSES.newest;
}

module.exports = {
    VALID_SORTS,
    parseSort,
    buildOrderByClause
};
