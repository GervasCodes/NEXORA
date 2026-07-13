# NEXORA - efficiency pass

## 1. Install new backend dependencies
`package.json` now lists `compression` and `express-rate-limit`. On your
machine / Render build:

    cd backend && npm install

## 2. Run the new migration
`database/migrations/022_product_search_and_indexes.sql` adds two
composite indexes and a FULLTEXT index on `products`. FULLTEXT index
creation briefly locks the table (usually well under a second unless your
catalog is huge) - fine to run during a normal deploy, but worth knowing.

    cd database && npm run migrate

## 3. What changed and why

**Backend**
- **Gzip compression** (`compression` middleware in `app.js`) - every
  JSON/HTML response is now compressed over the wire. Biggest win on
  product listings and admin tables.
- **Rate limiting** (`rateLimit.middleware.js`) - a strict limiter (20
  requests/15min) on login, register, and both OTP flows (login + password
  change), since each of those can trigger a bcrypt compare, a DB write,
  and for OTP, a Brevo email send - the most expensive endpoints to abuse.
  A looser general limiter (600 req/15min) sits in front of the whole API
  as a safety net against scraping/misbehaving clients.
- **Settings caching** (`settings.service.js`) - `platform_settings`
  (commission rate, rider fee, verification fee) is read on nearly every
  order, completed delivery, and verification page load, but only
  changes when an admin edits it. Added a 30s in-memory cache, invalidated
  immediately on any admin update - so it's never stale after a real
  change, just cached between them.
- **Product search & indexes** (migration 022 + `product.repository.js`)
  - Search used to be `LIKE '%term%'`, which can never use an index (the
    leading `%` forces a full table scan) and gets slower as your catalog
    grows. It now uses a MySQL FULLTEXT index with `MATCH...AGAINST`,
    which is indexed and ranks results by relevance instead of just
    newest-first. Falls back to the old LIKE behavior only for 1-2
    character searches, since FULLTEXT's default minimum word length
    would otherwise silently match nothing on those.
  - Added composite indexes for the two most common listing queries
    (`is_active + created_at`, `category_id + is_active`) so browsing the
    catalog or a category doesn't need a filesort as your product count
    grows.

**Frontend**
- **Route-based code splitting** (`App.jsx`) - every page was previously
  imported eagerly, so a buyer who never opens the seller or admin areas
  still downloaded all of it on first load. All ~28 pages are now
  `React.lazy()`, each becoming its own small chunk loaded only when that
  route is visited. Measured result on this build: the main JS bundle
  dropped from 553KB to 288KB, and the "chunk too large" warning from
  `vite build` is gone entirely.
- **Lazy-loaded images** - product thumbnails on catalog pages and the
  product-detail thumbnail strip now use `loading="lazy"`, so images
  below the fold don't compete with visible content for bandwidth on
  page load.

## 4. Smoke test after deploy
- [ ] Search for something 3+ characters - results should still be
      relevant (now ranked by match quality, not just recency)
- [ ] Search for something 1-2 characters - should still work (LIKE fallback)
- [ ] Open Network tab, load the homepage - JS should arrive gzip-encoded
      (`content-encoding: gzip` response header)
- [ ] Open Network tab, navigate around the site - you should see small,
      separate JS chunk files load per page instead of one big bundle
      upfront
- [ ] Try logging in with the wrong password ~20+ times fast - should get
      a "Too many attempts" response instead of hanging the server
