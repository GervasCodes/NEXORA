# Nexora Services — Phase 1 (Foundation): Backend layer

Follows the DB layer delivered in `NEXORA-services-phase1-DB.zip`. This
zip is **backend only** (routes/controllers/services/repositories +
docs). Frontend and UI/UX for Phase 1 follow as their own zips.

## Note: one fix to the Phase 1 DB migration

While building the backend I caught a real inconsistency in
`062_services_foundation.sql`: `services.provider_id` was pointing at
`seller_profiles.id`. Every other table in this codebase (`products.
seller_id`, the JWT's `req.user.id`) treats the **users.id** as the
identity, and joins `seller_profiles` via `user_id` when it needs store
details. I fixed the FK to reference `users(id)` instead, so the
service module could reuse the exact same "`seller_id` → `JOIN
seller_profiles sp ON sp.user_id = X.seller_id`" pattern `products`
already uses. The corrected migration file is included in this zip —
**replace your copy of `062_services_foundation.sql` with this one**
before running `npm run migrate` if you already grabbed the DB-layer
zip.

## What this adds

Two new backend modules, one new middleware, and small additions to the
existing `seller` module — following the exact same
repository/service/controller/validator/routes shape every other module
in this codebase uses (`category`, `product`, `storeType`).

### `modules/serviceCategory/` (mirrors `modules/category/`)

Admin CRUD for service categories + a public `GET /service-categories`
list and `GET /service-categories/browse` (adds a live listing count per
category — the Services equivalent of `GET /categories/departments`,
minus the sponsorship/trending machinery those grew over several later
product-marketplace phases; that's Phase 4/5 territory here too).

### `modules/service/` (mirrors `modules/product/`)

The core listing module:
- `POST /services` — create a listing (starts as `draft`)
- `POST /services/:id/images` / `/videos` — media upload (video capped
  at 3 per listing, same rule as `product.service.js`)
- `GET /services` / `GET /services/:slug` — public search + detail
- `GET /services/mine/list` / `/mine/:id` — provider's own listings
  (includes drafts, unlike the public search)
- `PUT /services/:id` — update
- `PUT /services/:id/publish` / `/unpublish` — a provider can move their
  own listing between `draft` and `published` at will (publishing
  requires at least one photo). Suspending a listing is deliberately
  **not** exposed here — that's an admin action, same split the
  migration's `status` vs `is_active` columns were designed around.
- `PUT /services/:id/deactivate` / `/activate` — same is_active toggle
  products have

### `middleware/requireServiceProvider.middleware.js`

New middleware, stacked after the existing `requireApprovedSeller` on
every provider-side Services route. Checks
`seller_profiles.merchant_type` is `service` or `hybrid` — this is what
actually enforces CHANGES.md's Permission Matrix (a plain Product Seller
stays restricted from Services until they opt in).

### `modules/seller/` additions

One new endpoint: `PUT /seller/merchant-type` (body: `{ merchant_type:
"product" | "service" | "hybrid" }`). Deliberately its own endpoint
rather than folded into the generic `PUT /seller/profile` — same
reasoning `POST /seller/verification/fee` already gets its own endpoint
instead of living in the profile-update validator. No approval gate on
the switch itself; it's just what unlocks the Services module of the
dashboard, and the Services endpoints already gate on approval
separately via `requireServiceProvider`.

### `app.js`

Mounts the two new route modules at `/api/v1/service-categories` and
`/api/v1/services` — new top-level namespaces (not nested under
`/categories` or `/products`), matching how CHANGES.md frames Services
as a parallel domain sharing infrastructure, not a variant of the
product catalog.

### Docs

`docs/API.md` gets the two new module sections plus the
`/seller/merchant-type` row; `docs/DATABASE.md`'s schema-overview entry
stays as delivered in the DB-layer zip (unchanged here except for the
migration fix above).

## Verification done in this sandbox

- `npm install` succeeded (528 packages, no errors)
- `node --check` passed on every new/modified file
- `npx eslint` passed clean on every new/modified file (one unused
  import caught and removed along the way)
- **Not done**: no live MySQL instance available here, so nothing has
  been run against a real database. Run `npm run migrate` then exercise
  the endpoints against your own dev DB before deploying.

## Files in this zip

```
backend/src/app.js                                              (updated)
backend/src/middleware/requireServiceProvider.middleware.js     (new)
backend/src/modules/seller/seller.repository.js                 (updated)
backend/src/modules/seller/seller.service.js                    (updated)
backend/src/modules/seller/seller.controller.js                 (updated)
backend/src/modules/seller/seller.validator.js                  (updated)
backend/src/modules/seller/seller.routes.js                     (updated)
backend/src/modules/service/*.js                                (new, 5 files)
backend/src/modules/serviceCategory/*.js                        (new, 5 files)
database/migrations/062_services_foundation.sql                 (corrected — see note above)
docs/API.md                                                      (updated)
docs/DATABASE.md                                                 (unchanged from DB-layer zip)
```

## Next: Frontend

Provider-side: a "Services" tab in the seller dashboard (merchant-type
switch, listing CRUD form, media upload, publish toggle). Buyer-side: a
`/services` browse page + category grid + listing detail page, reusing
`ProductGrid`'s pagination/infinite-scroll pattern where it fits.
