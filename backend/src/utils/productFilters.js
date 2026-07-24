// Phase 3A: query-building logic for the price/seller filters on the
// public product listing, pulled out of product.repository.js so it can
// be unit-tested without a database - same pattern as
// utils/productSearch.js for the search feature in Phase 3B.
//
// All three filters (min price, max price, seller) are independent and
// optional. Invalid or nonsensical input (negative prices, a min above
// the max, a non-numeric/non-positive seller id) is treated the same as
// "not provided" rather than erroring the whole listing request - a
// stray or malformed query param shouldn't 400 someone's whole page,
// it should just not apply that one filter.

// Accepts a raw (untrusted, string-or-undefined) price and returns a
// finite, non-negative number, or null if the input doesn't represent
// one.
function parsePrice(raw) {
    if (raw === undefined || raw === null || raw === "") return null;

    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return null;

    return value;
}

// Returns { min, max } with each side null when absent/invalid, and with
// min/max swapped if both were given but min > max (so a mis-ordered
// pair of inputs still narrows the results sensibly instead of matching
// nothing).
function parsePriceRange(minPriceRaw, maxPriceRaw) {
    let min = parsePrice(minPriceRaw);
    let max = parsePrice(maxPriceRaw);

    if (min !== null && max !== null && min > max) {
        [min, max] = [max, min];
    }

    return { min, max };
}

// Accepts a raw (untrusted) seller id and returns a positive integer, or
// null if the input isn't one.
function parseSellerId(raw) {
    if (raw === undefined || raw === null || raw === "") return null;

    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) return null;

    return value;
}

// Phase 3B: location filter. seller_profiles.region/city are free-text
// (set by the seller in Store settings, see migration 003), so this is a
// trimmed exact-match string rather than a parsed id - same treatment as
// the FULLTEXT search's raw term. An empty/whitespace-only value is
// treated as "not provided", same as every other filter here.
function parseLocation(raw) {
    if (raw === undefined || raw === null) return null;

    const value = String(raw).trim();
    if (value === "") return null;

    return value;
}

// Phase 3B: minimum-rating filter. Only whole 1-5 star values make sense
// as a "4 stars & up" style filter control, so anything outside that
// range (or non-numeric) is treated the same as "not provided" rather
// than erroring - a stray/tampered query param shouldn't 400 the page.
function parseMinRating(raw) {
    if (raw === undefined || raw === null || raw === "") return null;

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > 5) return null;

    return value;
}

// Builds the extra SQL conditions/params for product.repository.js#findAll
// from already-parsed filter values. Kept separate from the parsing
// functions above so the repository can compose it alongside its other
// WHERE-clause pieces (category, search) without duplicating this logic.
function buildPriceSellerConditions({ minPrice, maxPrice, sellerId }) {
    const conditions = [];
    const params = [];

    // Filtering on discount_price when it's set, and on the regular
    // price otherwise, so "products under X" matches what a shopper
    // actually pays - a product currently on sale for less than X
    // shouldn't be excluded just because its non-discounted price is
    // higher.
    const effectivePrice = "COALESCE(p.discount_price, p.price)";

    if (minPrice !== null && minPrice !== undefined) {
        conditions.push(`${effectivePrice} >= ?`);
        params.push(minPrice);
    }

    if (maxPrice !== null && maxPrice !== undefined) {
        conditions.push(`${effectivePrice} <= ?`);
        params.push(maxPrice);
    }

    if (sellerId !== null && sellerId !== undefined) {
        conditions.push("p.seller_id = ?");
        params.push(sellerId);
    }

    return { conditions, params };
}

// Phase 3B: builds the extra SQL conditions/params for the location
// (region) and minimum-rating filters. Kept separate from
// buildPriceSellerConditions above so each filter group stays testable
// and reviewable on its own, following the same "just apply whatever
// pre-parsed values you're given" contract.
//
// The rating condition repeats the same correlated subquery used for the
// `average_rating` SELECT column (see product.repository.js) rather than
// referencing that column's alias, so it works unmodified in both the
// main listing query and its separate COUNT(*) query, which doesn't
// select that column at all. A product with no reviews has an AVG of
// NULL, and `NULL >= ?` is never true in SQL - so "4 stars & up"
// correctly excludes unreviewed products instead of matching them.
function buildLocationRatingConditions({ region, minRating }) {
    const conditions = [];
    const params = [];

    if (region !== null && region !== undefined) {
        conditions.push("sp.region = ?");
        params.push(region);
    }

    if (minRating !== null && minRating !== undefined) {
        conditions.push(
            "(SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) >= ?"
        );
        params.push(minRating);
    }

    return { conditions, params };
}

module.exports = {
    parsePrice,
    parsePriceRange,
    parseSellerId,
    parseLocation,
    parseMinRating,
    buildPriceSellerConditions,
    buildLocationRatingConditions
};
