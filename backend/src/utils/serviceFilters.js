// Phase 4 (Customer Experience) - query-building logic for the
// region/rating filters on the public service listing, the services
// counterpart of utils/productFilters.js's buildLocationRatingConditions.
//
// parseLocation/parseMinRating themselves are NOT duplicated here -
// they're generic string/rating parsers with nothing product-specific
// in them, so they're imported straight from productFilters.js (per
// CHANGES.md's own "Avoid duplicate implementations" requirement).
// Only the SQL-condition builder is services-specific, since it
// references s.region and reviews joined through bookings rather than
// sp.region and reviews joined through products.
const { parseLocation, parseMinRating } = require("./productFilters");

// Builds the extra SQL conditions/params for service.repository.js#findAll
// from already-parsed filter values. minRating's correlated subquery
// mirrors buildLocationRatingConditions's own reasoning: a service with
// no reviews has a NULL average, and `NULL >= ?` is never true in SQL,
// so "4 stars & up" correctly excludes unreviewed services.
function buildServiceLocationRatingConditions({ region, minRating }) {
    const conditions = [];
    const params = [];

    if (region !== null && region !== undefined) {
        conditions.push("s.region = ?");
        params.push(region);
    }

    if (minRating !== null && minRating !== undefined) {
        conditions.push(
            `(SELECT AVG(r.rating) FROM reviews r
              JOIN bookings b ON b.id = r.booking_id
              WHERE b.service_id = s.id) >= ?`
        );
        params.push(minRating);
    }

    return { conditions, params };
}

module.exports = {
    parseLocation,
    parseMinRating,
    buildServiceLocationRatingConditions
};
