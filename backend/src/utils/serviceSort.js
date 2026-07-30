// UI/UX polish pass on Nexora Services Phase 1 - services.repository.js
// hardcoded ORDER BY s.created_at DESC with no sort option, unlike
// products (utils/productSort.js). Same whitelist-lookup pattern here.
//
// Phase 4 (Customer Experience): "rating" is now available since
// services have reviews (via bookings), and the clause set gained a
// relevance-aware default now that the listing supports FULLTEXT search
// (utils/productSearch.js's buildProductSearchPlan, reused as-is by
// service.repository.js). Both additions mirror utils/productSort.js
// exactly:
//  - rating sorts on the same `average_rating` SELECT alias the listing
//    now computes (see service.repository.js), not a repeated subquery -
//    ORDER BY can reference a SELECT list alias in MySQL. A service with
//    no reviews has a NULL average_rating, and MySQL treats NULL as the
//    lowest possible value, so DESC order already puts unrated services
//    last with no extra CASE/IS NULL handling.
//  - buildOrderByClause takes a second `hasRelevance` argument: an
//    explicit sort always wins, otherwise an active FULLTEXT search
//    defaults to relevance order, otherwise newest-first.
const SORT_CLAUSES = {
    newest: "s.created_at DESC",
    price_low: "COALESCE(s.discount_price, s.base_price) ASC, s.created_at DESC",
    price_high: "COALESCE(s.discount_price, s.base_price) DESC, s.created_at DESC",
    rating: "average_rating DESC, review_count DESC, s.created_at DESC"
};

const VALID_SORTS = Object.keys(SORT_CLAUSES);

function parseSort(raw) {
    if (raw === undefined || raw === null || raw === "") return null;

    const value = String(raw);
    return VALID_SORTS.includes(value) ? value : null;
}

function buildOrderByClause(sort, hasRelevance) {
    if (sort && SORT_CLAUSES[sort]) {
        return SORT_CLAUSES[sort];
    }

    if (hasRelevance) {
        return "relevance DESC, s.created_at DESC";
    }

    return SORT_CLAUSES.newest;
}

module.exports = {
    VALID_SORTS,
    parseSort,
    buildOrderByClause
};
