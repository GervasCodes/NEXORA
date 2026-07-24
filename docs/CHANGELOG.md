# Changelog

All notable changes to NEXORA are recorded here, grouped by the phase they
shipped in. This log covers the **homepage/marketplace upgrade project**
(Phases 1–10 below); it does not restate the separate 10-phase
*maintenance roadmap* (gateway swaps, order splitting, delivery pricing,
etc.) that preceded it — see `README.md` for a summary of that earlier
work and `git log` for its individual commits.

Entries are ordered oldest → newest. Each phase's full write-up, where one
still exists in the repo, is linked from its heading.

## Phase 1 — Homepage Experience

- **1A — Homepage Analysis & Preparation**: decided departments would
  extend the existing `categories` table (new `cover_image_url` /
  `display_order` columns) rather than introduce a new table.
- **1B — Department Navigation**: migration `040_categories_department_fields.sql`;
  remapped 5 legacy categories onto 7 requested departments (Health &
  Beauty merged into Fashion & Beauty); new `GET /categories/departments`
  and `POST /categories/:id/cover`; new `DepartmentCard` component; `Home`
  shows department discovery by default; `AdminCategories` supports cover
  upload + display order.
- **1C — Dynamic Department Data**: `GET /categories/departments` now also
  returns recent products and a 7-day `newCount` per department;
  `DepartmentCard` shows an "N new" badge.
- **1D — Homepage UI Upgrade**: hero trust strip (verified sellers /
  tracked delivery / local vendors); department grid gains an
  `xl:grid-cols-5` breakpoint.

## Phase 2 — Department Marketplace

- **2A — Department Routing**: new `/departments/:slug` route +
  `DepartmentPage`; extracted the shared `ProductGrid` component
  (fetch/pagination/infinite-scroll) reused by both home search results
  and `DepartmentPage`; `DepartmentCard` links to the real route instead
  of a `?department=` query param.
- **2B — Product Feed**: trending/recent category queries join
  `seller_profiles` + stock for full `ProductCard` compatibility; new
  `ProductRow` horizontal-scroll component; `DepartmentPage` shows
  Trending + Recently added rows above the full grid.
- **2C — Department Sections**: `products.is_sponsored` flag (migration
  `041_products_sponsored_flag.sql`) with an admin sponsor/unsponsor
  toggle; promotions (discounted products) and featured-stores (rated
  verified sellers) sections; new
  `GET /categories/departments/:slug` endpoint; new `FeaturedStoreCard`.

## Phase 3 — Product Discovery

- **Product Browsing**: new `/products` full-catalog page
  (`BrowseProducts`), reusing `ProductGrid`; "Browse all" nav link
  (header + mobile drawer) with an `nav.browse` i18n key in both English
  and Swahili.
- **Search**: product search experience improved ahead of the filter work
  below.
- **3A — Price & Seller Filters**, **3B — Location & Rating Filters**,
  **3C — Sorting Options**: `ProductFilters` extended with price range,
  seller, region, and rating filters plus sort options, all passed
  through `ProductGrid`'s existing arbitrary-`params` `GET /products`
  contract with no structural changes needed. Backing indexes added in
  migrations `042_products_price_filter_index.sql` and
  `043_seller_profiles_region_index.sql`.

## Phase 4 — Product Cards

- **4A — Product Card Layout**, **4B — Rating, Badge & Location**,
  **4C — Product Actions**: `ProductCard` reworked for grid/list layouts,
  rating display, low-stock and sponsored badges, seller region, and
  quick actions (wishlist, add-to-cart) inline on the card.

## Phase 5 — Store Profiles

- **5A — Store Profile Basics**, **5B — Store Trust Info**,
  **5C — Store Catalog**: `StorePage` built out with profile header, trust
  signals (verification badge, join date, rating), and a paginated
  product catalog for the store.
- **5D — Reviews, About & Delivery**: `StorePage` gained an About section
  over the existing description, a delivery-info block driven by a
  privacy-safe `has_pickup_pin` flag (no coordinates exposed to buyers),
  and a paginated Reviews section via new `GET /reviews/store/:sellerId`.

## Phase 6 — Store Content

- **6A — Product Videos**: migration `044_product_videos.sql`; sellers
  can attach video to a product listing (`POST /products/:id/videos`).
- **6B — Product Audio**: migration `045_product_audio.sql`; audio
  attachments for products (`POST /products/:id/audio`) — used for voice
  descriptions where a written listing is less accessible.
- **6C — Enhanced Reviews (No Social Features)**: migrations
  `046_review_photos.sql` and `047_review_seller_reply.sql`; buyers can
  attach photos to a review, sellers can post one reply per review.
  Deliberately excludes upvoting, review reactions, or other social
  features not required by the spec.

## Phase 7 — Seller Branding

- **7A — Store Themes**: migration `048_seller_store_theme.sql`; sellers
  choose a store color theme applied across their `StorePage`.
- **7B — Branding**: migration `049_seller_branding.sql`; logo/banner
  upload (`POST /seller/upload-logo`, `POST /seller/upload-banner`) and
  store-level branding fields.
- **7C — Seller Collections**: migration `050_seller_collections.sql`;
  sellers group products into named collections
  (`GET/POST /seller/collections`, `POST /seller/collections/:id/products`),
  surfaced on the storefront via `GET /stores/:slug/collections`.
- **7D — Verification & Trust**: seller verification workflow with
  document review (`accountVerification` module —
  `PUT /admin/account-verifications/:id/approve` /
  `.../reject`) and a paid Verified Seller badge.

## Phase 8 — Sponsored Marketplace

- **8A — Sponsored Products**: migration `051_sponsorship_campaigns.sql`;
  sellers buy sponsored placement for individual products
  (`sponsorship` module — pricing, campaign create/cancel).
- **8B — Featured Stores**: migration `052_featured_store_campaigns.sql`;
  parallel campaign system for featured-store placement
  (`featuredStore` module).
- **8C — Department Sponsorship**: migration
  `053_department_sponsorship_campaigns.sql`; sellers sponsor a
  department-level placement (`departmentSponsorship` module). All three
  sponsorship types share one admin oversight surface
  (`GET /admin/sponsorship-campaigns`,
  `GET /admin/featured-store-campaigns`,
  `GET /admin/department-sponsorship-campaigns`).

## Phase 9 — Payment Trust System

- **9A — Payment Analysis**: audit of the existing payment flow to scope
  an escrow-style hold-and-release model on top of it (see
  `docs/ESCROW_ANALYSIS.md`).
- **9B — Escrow Foundation**: migration `054_escrow_foundation.sql`.
- **9C — Payment Holding**: payments captured at order time are held
  rather than released to the seller immediately.
- **9D — Seller Release**: admin-triggered escrow release
  (`PUT /admin/orders/:id/release-escrow`) once a delivery is confirmed,
  crediting the seller's wallet.

## Phase 10 — Final Optimization

- **[10A — Testing](../README-phase-10A.md)**: backend/frontend test
  suite work ahead of the final release.
- **[10B — UI Optimization](../README-phase-10B.md)**: UI/accessibility
  markup fixes across the app, including an overhaul of
  `IncomingOfferModal`.
- **[10C — Performance](../README-phase-10C.md)**: memoized five
  previously un-memoized React context providers (`AuthContext`,
  `CartContext`, `SocketContext`, `ThemeContext`, `WishlistContext`) that
  were handing every consumer a new object on every render, and memoized
  `ProductCard` against unnecessary re-renders from its parent
  `ProductGrid`.
- **10D — Final Documentation** *(this phase)*: brought `README.md`,
  `docs/API.md`, `docs/DATABASE.md`, and this changelog up to date with
  everything shipped since Phase 3A (the last point at which the root
  README was updated); fixed a stale SMTP reference in
  `docs/DEPLOYMENT.md` left over from the earlier Brevo migration.
