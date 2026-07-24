// Phase 3B: query-building logic for product search, pulled out of
// product.repository.js so it can be unit-tested without a database.
//
// Background: migration 022 added a FULLTEXT index on
// products(name, brand, description) and product.repository.js originally
// queried it with NATURAL LANGUAGE MODE. That mode only matches whole /
// stemmed words - typing "lap" while looking for "Laptop" returns nothing
// until the full word is typed. That's a real problem for two places in
// this app: SearchBox.jsx's live-suggestion dropdown (fires from 2
// characters) and anyone who just hasn't finished typing yet on the full
// search results page.
//
// BOOLEAN MODE with a trailing `*` wildcard on each word turns every term
// into a prefix match ("lap*" matches "laptop", "laptops", "lapel", ...)
// while still using the same FULLTEXT index - no migration needed, no
// full table scan, just a better match mode.

const MIN_FULLTEXT_CHARS = 3;

// InnoDB FULLTEXT boolean-mode operators (+ - < > ( ) ~ * " @) change the
// meaning of a query if left in user input (e.g. a search for `+free -tax`
// would be parsed as "must contain free, must not contain tax" instead of
// literal text). Strip them before building the query so search always
// behaves like plain-text search from the user's point of view.
const BOOLEAN_OPERATORS = /[+\-<>()~*"@]/g;

function toBooleanPrefixQuery(search) {
    return search
        .trim()
        .split(/\s+/)
        .map((word) => word.replace(BOOLEAN_OPERATORS, ""))
        .filter(Boolean)
        .map((word) => `${word}*`)
        .join(" ");
}

// Returns a plan describing how product.repository.js#findAll should
// search, given a raw (untrusted) search string:
//   - { mode: "none" }      - no search term, no extra WHERE clause
//   - { mode: "like", raw } - 1-2 chars, FULLTEXT's default min word
//                             length would silently match nothing, so fall
//                             back to a LIKE scan (correct, just uncached)
//   - { mode: "fulltext", raw, booleanQuery } - 3+ chars, use the FULLTEXT
//                             index in BOOLEAN MODE with prefix wildcards
function buildProductSearchPlan(search) {
    const raw = (search || "").trim();

    if (!raw) {
        return { mode: "none" };
    }

    if (raw.length < MIN_FULLTEXT_CHARS) {
        return { mode: "like", raw };
    }

    const booleanQuery = toBooleanPrefixQuery(raw);

    // Every word got stripped down to nothing (e.g. a search of just
    // punctuation/operators) - nothing meaningful left to match against.
    if (!booleanQuery) {
        return { mode: "like", raw };
    }

    return { mode: "fulltext", raw, booleanQuery };
}

module.exports = {
    buildProductSearchPlan,
    toBooleanPrefixQuery,
    MIN_FULLTEXT_CHARS
};
