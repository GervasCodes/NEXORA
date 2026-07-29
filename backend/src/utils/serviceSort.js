// UI/UX polish pass on Nexora Services Phase 1 - services.repository.js
// hardcoded ORDER BY s.created_at DESC with no sort option, unlike
// products (utils/productSort.js). Same whitelist-lookup pattern here,
// scoped down to what a service listing actually has: no "rating" sort
// option, since services don't have reviews yet (Phase 4 - Customer
// Experience).
const SORT_CLAUSES = {
    newest: "s.created_at DESC",
    price_low: "COALESCE(s.discount_price, s.base_price) ASC, s.created_at DESC",
    price_high: "COALESCE(s.discount_price, s.base_price) DESC, s.created_at DESC"
};

const VALID_SORTS = Object.keys(SORT_CLAUSES);

function parseSort(raw) {
    if (raw === undefined || raw === null || raw === "") return null;

    const value = String(raw);
    return VALID_SORTS.includes(value) ? value : null;
}

function buildOrderByClause(sort) {
    if (sort && SORT_CLAUSES[sort]) {
        return SORT_CLAUSES[sort];
    }

    return SORT_CLAUSES.newest;
}

module.exports = {
    VALID_SORTS,
    parseSort,
    buildOrderByClause
};
