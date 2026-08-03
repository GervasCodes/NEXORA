# Product Recommendations (Phase 3b)

Part of the Revenue & Product Enhancements roadmap. Rules-based (not
machine-learning) recommendations - every ranking factor is a plain SQL
aggregate, which keeps the system auditable, needs no training data or
model infrastructure, and cold-starts correctly for a brand-new buyer or
a thin catalog.

## Ranking rules

Two shelves, both backed by `recommendation.service.js`:

1. **"Recommended for you"** (`GET /api/v1/recommendations/for-me`) -
   - Signed-in buyer with order history: best-selling products (units
     sold, trailing 60 days) within their top 3 most-purchased
     categories, excluding anything they've already bought.
   - Everyone else (no history, or not signed in): platform-wide
     trending, same trailing-60-day sales-velocity ranking.
   - If a buyer's category matches don't fill the shelf, trending tops
     up the remainder rather than leaving it sparse.
2. **"You may also like"** (`GET /api/v1/recommendations/related/:slug`) -
   same-category best-sellers for a given product, excluding the product
   itself, topped up with trending if the category is thin.

Both endpoints are public but personalize automatically when a valid
buyer JWT is present (`recommendation.controller.js#getOptionalBuyerId`
decodes it permissively - a missing/invalid token isn't an error here,
just "not personalized," unlike every other buyer-only endpoint in this
codebase that requires auth outright).

## Data reused, nothing new

No new tables. Queries read `order_items`/`orders`/`products` exactly as
they already exist, and the SELECT shape in
`recommendation.repository.js` is byte-for-byte the same columns
`product.repository.js#findAll` returns - so the existing `ProductCard`
component renders recommendation results with zero new prop-mapping
code.

## Frontend

`RecommendedProducts.jsx` - one reusable horizontal shelf component,
parameterized by endpoint + title:
- `Home.jsx` - "Recommended for you", shown on the non-search homepage.
- `ProductDetail.jsx` - "You may also like", shown below reviews.

## Explicitly out of scope for this sub-phase

- No recommendations for services/bookings yet - only products. The same
  rules-based pattern (category affinity + booking-count velocity) would
  extend cleanly to `services`/`bookings` if wanted later.
- No click-through/impression tracking - "trending" is driven by actual
  sales, not views, so no new event-logging infrastructure was needed.
- No per-buyer caching - each shelf load is a live query. Fine at
  current scale; worth revisiting if this becomes a hot path (see Phase
  4's scalability work).
