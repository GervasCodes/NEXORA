# Nexora Services — Phase 1 (Foundation): Frontend layer

Follows the DB and backend layers already delivered. This zip is
**frontend only**. UI/UX polish (nav animations, richer filters, empty
states, etc.) is its own zip next.

## Scope note: functional, not yet polished

This layer intentionally sticks to functional parity with the backend —
routes, data fetching, forms — reusing your existing visual language
(same Tailwind classes, same card/grid patterns as products) rather than
introducing new design work. Deeper UI/UX (icon refinement, richer
filters like price range, animation, mobile polish beyond what already
comes free from reused components) is scoped to the UI/UX phase, per
your own db → backend → frontend → UI/UX split.

## What this adds

### Buyer-facing

- **`components/ServiceCard.jsx`** / **`components/ServiceGrid.jsx`** —
  mirror `ProductCard`/`ProductGrid` (grid/list toggle, infinite scroll,
  skeletons), pointed at `/services` instead of `/products`. No
  cart/wishlist buttons — booking is Phase 2, so there's nothing to add
  to cart yet.
- **`pages/ServicesBrowse.jsx`** (`/services`) — category chips (from
  `GET /service-categories/browse`, with live listing counts) + a search
  box + the grid.
- **`pages/ServiceDetail.jsx`** (`/services/:slug`) — media gallery
  (images and videos), pricing with the per-night/per-hour/etc. suffix,
  provider link, location. Deliberately shows an honest "Booking opens
  soon" notice instead of a non-functional book/pay button.

### Provider-facing (seller dashboard)

- **`pages/seller/SellerServices.jsx`** (`/seller/services`) — if the
  seller's `merchant_type` is still `product`, shows an opt-in gate
  ("Add Services" → `hybrid`, or "Switch to Services only" → `service`)
  instead of a listing table. Once opted in, lists their services with
  publish/unpublish and activate/deactivate controls, mirroring
  `SellerProducts.jsx`.
- **`pages/seller/SellerServiceForm.jsx`** (`/seller/services/new`,
  `/seller/services/:id/edit`) — mirrors `SellerProductForm.jsx`: full
  field set (title, description, category, pricing model, base/discount
  price, location), photo/video upload (video capped at 3, synced with
  the backend's `MAX_VIDEOS_PER_SERVICE`), and a **Publish** button
  (disabled until at least one photo is uploaded, matching the backend's
  own publish guard).

### Navigation

- New "Services" tab in the seller dashboard sidebar (`SellerLayout.jsx`).
- New "Services" link in the header, desktop nav and mobile drawer
  (`Header.jsx`), with a new calendar-style `ServicesIcon`
  (`NavIcons.jsx`).
- `nav.services` translation key added in both English and Swahili
  (`LanguageContext.jsx`).
- Routes wired into `App.jsx`, lazy-loaded the same way every other page
  in this app already is.

## Verification done in this sandbox

- `npm install` succeeded (455 packages)
- `eslint` passed clean on every new/modified file
- `npm run build` completed successfully — all four new pages
  (`ServicesBrowse`, `ServiceDetail`, `SellerServices`,
  `SellerServiceForm`) show up as their own code-split chunks, same as
  every other route
- `vitest run` (excluding one pre-existing test file that hangs
  independent of this work — `AdminNotificationBell.test.jsx`, an
  infinite-update-loop unrelated to anything touched here): **181/182
  tests passed**. The one failure
  (`tests/components/chat/MessageSearch.test.jsx`) is a timing-sensitive
  debounce assertion in the chat module, which this delivery never
  touches — pre-existing flakiness, not a regression from this work.
- **Not done**: no live backend/DB running in this sandbox, so nothing
  has been click-tested end-to-end. Run `npm run dev` against your own
  backend + DB (with migration 062 applied) to exercise the actual
  flows before deploying.

## Files in this zip

```
frontend/src/App.jsx                              (updated)
frontend/src/components/Header.jsx                (updated)
frontend/src/components/NavIcons.jsx               (updated)
frontend/src/components/SellerLayout.jsx           (updated)
frontend/src/components/ServiceCard.jsx            (new)
frontend/src/components/ServiceGrid.jsx            (new)
frontend/src/context/LanguageContext.jsx           (updated)
frontend/src/pages/ServiceDetail.jsx                (new)
frontend/src/pages/ServicesBrowse.jsx               (new)
frontend/src/pages/seller/SellerServiceForm.jsx     (new)
frontend/src/pages/seller/SellerServices.jsx        (new)
```

## Next: UI/UX

Once you've clicked through this against your own backend, the UI/UX
pass covers things like: a price-range filter on `ServicesBrowse`
(same shape as `ProductFilters.jsx`), category cover-image cards instead
of plain chips, richer empty/loading states, and any visual refinement
you want on `ServiceCard`/`ServiceDetail` once you can see it live.
