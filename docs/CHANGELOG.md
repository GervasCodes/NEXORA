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

# Admin, Notification & Messaging Trust Upgrade

A separate, later project (its own 1–7 phase numbering, unrelated to the
homepage/marketplace phases above). Migrations `058`–`060`.

## Phase 1 — Admin Account Control

- **Suspend / Unsuspend**: migration `058_admin_account_suspension.sql`
  adds `users.suspended_at` / `suspension_reason` / `suspended_by`.
  Replaces the old bare deactivate/activate toggle with
  `PUT /admin/users/:id/suspend` (requires a reason) and
  `PUT /admin/users/:id/unsuspend`. Suspending can't target a
  self-deleted account or the acting admin's own account; both actions
  notify the affected user and write an `audit_logs` entry. Login is
  blocked immediately (`login.service.js`, distinct `ACCOUNT_SUSPENDED`
  403 carrying the reason) and a still-live session is blocked on its
  next request (`auth.middleware.js`); the frontend shows a full-screen
  `SuspendedScreen` for both cases via a response-interceptor hook in
  `AuthContext`.
- **Permanent Delete (generalized)**: the existing PII-scrubbing
  `permanentlyDeleteUser` logic no longer requires prior self-deletion —
  it's now a standalone `DELETE /admin/users/:id` action (super admin
  only), alongside the existing `DELETE /admin/deleted-users/:id`, both
  calling the same service function. Now also cleans up cart items, push
  subscriptions, and deactivates any still-live seller listings.
- See `README-phase-1.md` for the full write-up.

## Phase 2 — Admin Notifications

- Migration `059_admin_notifications.sql`: `admin_notifications`, a
  single shared feed (one row per event, one shared read state) rather
  than a per-admin fan-out — see the migration's header comment for the
  reasoning against reusing the per-user `notifications` table.
- New `adminNotification` module: `GET /admin/notifications` (filterable
  by `category` / `unread_only` / `limit`), `GET .../unread-count`,
  `PUT .../read-all`, `PUT .../:id/read`.
- Emits on: user registration, account suspension/unsuspension, account
  permanent deletion, admin account created/permissions
  changed/deleted, fraud flags raised, disputes (reports) submitted.
  Creation is fire-and-forget, matching `audit.service.js#log`'s
  never-block-the-real-action pattern.

## Phase 3 — PWA & Real-Time Notifications

- No new migration. Wires the existing `push_subscriptions` table
  (`016_push_subscriptions.sql`) and the Socket.IO `admins` room (which
  every admin/super_admin socket already auto-joins) into Phase 2:
  every admin-notification event fans out over Socket.IO
  (`admin_notification:new`) and, for admins with the PWA installed and
  no tab open, Web Push (`pushService.sendToAdmins`).

## Phase 4 — Messaging Upgrade

- Migration `060_messaging_upgrade.sql`: `messages.delivered_at` /
  `read_at` (per-message delivery + read receipts, distinct from the
  existing conversation-level `is_read`); `messages.attachment_url` /
  `attachment_type` / `attachment_name` / `attachment_size` (one
  attachment per message — image, video, audio, or file; `message` text
  becomes optional to allow an attachment with no caption);
  `message_reactions` (WhatsApp/Slack-style emoji reactions — a reactor
  can react with several distinct emoji but not the same emoji twice);
  a `(conversation_id, created_at)` index backing new in-conversation
  message search.
- New endpoints: `POST /chat/conversations/:id/attachments`,
  `GET /chat/conversations/:id/search`,
  `POST` / `DELETE .../messages/:messageId/reactions[/:emoji]`.
- New Socket.IO events in the `conversation:<id>` room:
  `reaction_updated` alongside the existing `new_message` /
  `message_deleted` / `messages_read` / `typing`.

## Phase 5 — Audit Logs

- No new migration — extends the existing `audit_log` table (`035`).
  `backend/src/modules/audit/audit.constants.js` groups every
  `event_type` the codebase emits into the categories the admin panel's
  filter dropdown uses (`account`, `admin`, `auth`, `orders`,
  `payments`, `refunds`).
- `GET /admin/audit-logs` gains `category`, `event_type`, `user_id`,
  `date_from`/`date_to`, free-text `q`, `admin_actions_only`, and
  `page`/`page_size` query params (see `docs/API.md`).

## Phase 6 — Automated Test Review Only

- Review-only phase: existing backend/frontend automated test suites
  were reviewed for coverage of the Phase 1–5 changes above; no
  production code or schema changed.

## Phase 7 — Documentation *(this phase)*

- Brought `docs/API.md` and `docs/DATABASE.md` up to date with every
  Phase 1–5 change above (new/changed endpoints, new tables/columns,
  new Socket.IO events) and added this changelog section. See
  `README-phase-7.md` for the phase write-up.
