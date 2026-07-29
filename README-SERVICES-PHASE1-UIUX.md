# Nexora Services — Phase 1 (Foundation): UI/UX layer

Follows the DB, backend, and frontend layers already delivered. This
completes Phase 1 (Foundation) of the Nexora Services roadmap.

## What this adds

### Category cover-image cards (was: plain pill chips)

`ServicesBrowse.jsx` previously showed category filters as plain text
pill buttons. New `components/ServiceCategoryCard.jsx` mirrors
`DepartmentCard.jsx`'s treatment exactly — cover image with a gradient
fallback (same rotating gradient set) when no cover is set, listing
count overlay, hover lift. Categories now read as a real visual grid
instead of a row of buttons.

### A real admin page to set those covers

Building the cards above surfaced a genuine gap: the backend has had a
`POST /service-categories/:id/cover` endpoint since the backend layer,
but **no frontend ever called it** — there was no way to actually upload
a cover image. New `pages/admin/AdminServiceCategories.jsx` (mirrors
`AdminCategories.jsx`) fixes that: full CRUD plus cover upload, wired in
at `/admin/service-categories` with a new "Service categories" tab in
the admin Catalog group.

### Price range + sort filters

New `components/ServiceFilters.jsx` (mirrors `ProductFilters.jsx`,
scoped down — no seller/rating filters, since services don't have
per-store filtering UI or reviews yet) adds working min/max price
inputs and a sort dropdown (Newest / Price low→high / Price high→low)
to `ServicesBrowse.jsx`.

**This needed a small backend addition**, disclosed here the same way
the migration fix was in the backend-layer README:
`service.repository.js#findAll` had a hardcoded `ORDER BY
s.created_at DESC` with no way to sort by price — unlike `products`,
which has had sort support since Phase 3C of your earlier marketplace
project. Added `backend/src/utils/serviceSort.js` (same
whitelist-lookup pattern as `utils/productSort.js`, scoped to what a
service listing actually has — no `rating` option, since service
reviews are Phase 4) and wired `sort` through
`service.service.js`/`service.repository.js`/`docs/API.md`. This is a
backend file change shipped inside the UI/UX zip because the feature
it enables is purely a UI/UX concern (a sort dropdown) and splitting one
whitelist util across two zips would be worse than just disclosing it
clearly here.

## Verification done in this sandbox

- `eslint` passed clean on every new/modified file, frontend and backend
- `npm run build` (frontend) succeeded — `ServicesBrowse` chunk grew as
  expected with the new filter/card components, everything else
  unaffected
- `node --check` passed on the new backend util and both modified
  service module files
- **Not done**: no live DB to confirm the new `sort` SQL produces
  correct results, and no visual check of the category cards (no way to
  render this sandbox's build in a browser) — please eyeball
  `/services` and `/admin/service-categories` once you deploy this.

## Files in this zip

```
backend/src/modules/service/service.repository.js   (updated — sort param)
backend/src/modules/service/service.service.js       (updated — sort param)
backend/src/utils/serviceSort.js                     (new)
docs/API.md                                            (updated)
frontend/src/App.jsx                                    (updated — admin route)
frontend/src/components/AdminLayout.jsx                 (updated — admin tab)
frontend/src/components/ServiceCategoryCard.jsx         (new)
frontend/src/components/ServiceFilters.jsx               (new)
frontend/src/pages/ServicesBrowse.jsx                     (updated)
frontend/src/pages/admin/AdminServiceCategories.jsx       (new)
```

## Phase 1 (Foundation) is now complete

All four layers — DB, backend, frontend, UI/UX — are delivered across
these four zips:

```
NEXORA-services-phase1-DB.zip
NEXORA-services-phase1-backend.zip
NEXORA-services-phase1-frontend.zip
NEXORA-services-phase1-uiux.zip   (this one)
```

Apply in that order: run the migration first, then drop in backend
files, then frontend, then this one on top.

## Next: Phase 2 (Booking Infrastructure)

Per CHANGES.md's own roadmap — `service_availability`,
`bookings`, `booking_items`, `provider_payouts`, plus the buyer-facing
date picker and provider-facing calendar/booking management UI. Same
DB → backend → frontend → UI/UX delivery pattern, whenever you're ready
to start it.
