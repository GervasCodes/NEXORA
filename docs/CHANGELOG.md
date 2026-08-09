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

## Phase 7 — Documentation

- Brought `docs/API.md` and `docs/DATABASE.md` up to date with every
  Phase 1–5 change above (new/changed endpoints, new tables/columns,
  new Socket.IO events) and added this changelog section. See
  `README-phase-7.md` for the phase write-up.

## Monetization Master Switch & Payment Reliability (2026-08-08)

- Migration `079_monetization_master_switch.sql`: four new
  `platform_settings` rows (`monetization_subscriptions_enabled`,
  `monetization_commission_enabled`, `monetization_sponsorship_enabled`,
  `monetization_verification_fee_enabled`), all seeded OFF — a fresh
  launch is fully free by default. New `monetization_schedule` table for
  scheduling a flag flip at a future date/time.
- New Admin Billing Control Center: `GET/PUT /admin/monetization`,
  `GET/POST /admin/monetization/schedule`,
  `DELETE /admin/monetization/schedule/:id`, and a matching
  `AdminBillingControl.jsx` page. Every flag change is recorded in the
  existing `audit_logs` table rather than new tracking columns.
- Enforcement wired into the four monetization surfaces: subscriptions
  (`subscription.controller.js`'s `subscribe*` actions activate for free
  instead of creating a payment request when disabled), commission
  (`subscription.service.js#getEffectiveCommissionRate` returns flat 0%),
  sponsorship/featured-store/department-sponsorship (`createCampaign` in
  each service skips the wallet charge and auto-approves), and seller
  verification fee (`payVerificationFee` waives instantly;
  `requireVerificationFeePaid.middleware.js` no longer blocks access
  while the fee isn't actually being charged).
- New every-minute `monetizationSchedule` cron job applies due scheduled
  activations, same idempotent pattern as `departmentMaintenanceSchedule`
  (`069`).
- Payment reliability fix: `providers/registry.js`'s
  `mobile_money.isConfigured()` previously only checked that
  `MOBILE_MONEY_PROVIDER` named a real rail, not whether that rail's own
  credentials were actually present — so checkout could list Mobile
  Money as available while the real payment then failed with "Mobile
  money is not configured". `mobileMoney.provider.js` now exports a real
  `isConfigured()` that resolves to the actively-selected rail's own
  check, and the registry uses it. Regression test added:
  `tests/unit/payment/registry.test.js`.
- See `README-phase-1.md` for the full write-up.

## Mobile Number Country Code System (2026-08-08)

Phase 3 of the "Monetization Control, Payment Reliability & UX
Improvement" roadmap (roadmap's Section 3 — numbered Phase 3 since
Section 2's payment fix was folded into Phase 1 alongside the
Monetization Master Switch).

- New `backend/src/utils/phoneNumber.js`: centralized phone
  normalization/validation. Every stored phone number is now E.164
  (`+255712345678`), regardless of how it was typed in (with/without a
  leading `0`, with/without a `+`, with/without the dial code already
  attached). Covers Tanzania/Kenya/Uganda/Rwanda/Burundi with exact
  national-number-length validation, plus a pass-through path for
  already-international numbers so it stays compatible with the
  frontend's existing ~50-country registration picker
  (`frontend/src/data/countryCodes.js`).
- New `backend/src/validators/sharedPhoneValidator.js`: one reusable
  express-validator chain, applied everywhere a phone number is
  collected instead of each module's own ad-hoc length check —
  registration (all 3 roles), profile updates, checkout shipping phone,
  seller business phone, seller verification-fee mobile-money phone,
  subscription mobile-money phone, and booking mobile-money payment
  (this last one had **no phone validation at all** before this phase —
  a real gap closed here, not just a consistency cleanup).
- No schema change needed — `users.phone`/`seller_profiles.business_phone`/
  `orders.shipping_phone` were already `VARCHAR(30)`, wide enough for
  E.164.
- New shared frontend `PhoneInput.jsx` component (country selector +
  number field), wired into every standalone phone entry point:
  profile settings, seller business phone, checkout contact phone,
  booking mobile-money payment, seller-verification mobile-money
  payment, subscription mobile-money payment. `Register.jsx` needed no
  changes — it already sends fully-qualified international numbers via
  its own existing country picker.
- New test suite: `backend/tests/unit/utils/phoneNumber.test.js`.
- See `README-phase-3.md` for the full write-up.

## Duplicate Service Department Cleanup (2026-08-08)

Phase 4 of the "Monetization Control, Payment Reliability & UX
Improvement" roadmap (roadmap Section 5, "PWA Install Prompt Review",
was reviewed during Phase 1's analysis and found to already be
correctly implemented — skipped rather than given its own phase).

- **Root cause** (found during Phase 1's analysis, fixed now):
  `Home.jsx` rendered the "Services" department twice — once as the
  real `services` category card (from `/categories/departments`,
  re-enabled in migration `065`) via the departments loop, and again as
  a second, hardcoded static tile pointing to `/services`. Both linked
  to the same destination concept, so the homepage showed two "Services"
  tiles.
- **Fix:** the departments loop now filters out the `services` slug
  before mapping, keeping only the purpose-built static tile (which
  already shows an accurate service count and a distinct icon — a
  generic `DepartmentCard` for that row would show a product count of 0,
  since services aren't linked into the products table the way every
  other department's count is).
- Single-file, frontend-only change. See `README-phase-4.md`.

## Mobile Navigation Unification (2026-08-08)

Phase 6 of the "Monetization Control, Payment Reliability & UX
Improvement" roadmap (roadmap Section 6). Phase 5 (Section 7, PWA
Install Prompt) was already resolved during Phase 1's analysis with no
code change needed, so numbering continues straight to Phase 6.

- New shared `frontend/src/components/MobileBottomNav.jsx` — one fixed
  bottom tab bar component (5 slots, `md:hidden`, `env(safe-area-inset-bottom)`
  padding for the iOS home-indicator area, 52px-tall full-width tap
  targets per tab), reused across all three role-specific mount points
  below instead of each role inventing its own.
- **Buyer** — mounted from `Header.jsx`: Home (`/`), Orders, Messages,
  Cart (substituting for Wallet, which doesn't apply to buyers), Profile.
- **Seller / Service Provider** — mounted from `SellerLayout.jsx`:
  Home (`/seller`), Orders **or** Bookings (follows the seller's own
  `merchant_type`, so a service-only seller's tab points at Bookings
  and never bounces them through the existing product/service
  direct-access guard), Messages, Wallet, Profile. Supplements — does
  not replace — the existing grouped mobile drawer covering all 18
  other tabs.
- **Delivery Agent** — mounted from `DeliveryLayout.jsx`: Home
  (`/delivery`), Deliveries (`/delivery/mine`), Messages, Earnings
  (fills the Wallet slot — delivery agents don't have a separate wallet
  page), Profile. Also bumped the existing top tab row's touch target
  height (`py-2.5` → `py-3`) while in this file.
- `App.jsx` adds bottom padding to page content for any role that gets
  a bottom nav, so it doesn't get covered by the fixed bar.
- New `WalletIcon` added to `NavIcons.jsx`.
- Hover-only-interaction audit: the existing desktop nav tooltips
  already pair `group-hover` with `group-focus-visible` (no keyboard/touch
  gap), and are `hidden` below `md` anyway, so nothing to fix there. The
  new bottom nav has no hover-dependent affordances — labels are always
  visible.
- See `README-phase-6.md` for the full write-up, including what was
  deliberately left out of this phase's scope.

## Trust & Monetization Communication (2026-08-08)

Phase 7 of the "Monetization Control, Payment Reliability & UX
Improvement" roadmap (roadmap Section 6, "Trust & Monetization
Communication" — numbered Phase 7 in this delivery sequence since
Section 6's other half, "Mobile Navigation Unification", was already
delivered as Phase 6; the roadmap document numbers its sections, not
delivery phases, and these two ended up sharing a section number).

- New `GET /settings/monetization-status` (authenticated, any role) —
  the seller-facing counterpart to the admin-only
  `GET /admin/monetization` from Phase 1, returning each flag's
  enabled/disabled state plus any pending scheduled activation, without
  the audit/actor detail that's admin-only information.
- New `frontend/src/components/BillingStatusBanner.jsx` — one
  self-fetching banner ("free during launch" / "Billing starts on
  [date]"), dropped onto `SellerSubscription.jsx`, `SellerSponsorship.jsx`,
  `SellerFeaturedStore.jsx`, `SellerDepartmentSponsorship.jsx`, and
  `SellerVerification.jsx`. Shows nothing once a flag is live (billing
  already active), so it's a no-op the moment monetization actually
  turns on for that stream.
- Push notification reminders: `monetizationSchedule.job.js` (the
  every-minute cron from Phase 1) now also sends a push notification to
  every seller/provider 3 days and 1 day before a scheduled billing
  change takes effect, idempotently (never re-sent). New
  `pushService.sendToRoles()` (generalizes the existing
  `sendToAdmins()`), migration `080_monetization_communication_reminders.sql`
  adds the two reminder-tracking columns.
- **SMS reminders were not implemented** — there is no SMS sending
  capability anywhere in this codebase (OTP delivery uses email via
  Brevo, not SMS). Flagged rather than fabricated; see
  `README-phase-7.md`.
- **Onboarding checklist update was not implemented** — no onboarding
  checklist component exists anywhere in the codebase for this phase to
  update. Also flagged rather than fabricated.
- See `README-phase-7.md` for the full write-up.

## UX Polish (2026-08-08)

Phase 8 of the "Monetization Control, Payment Reliability & UX
Improvement" roadmap (roadmap Section 8) — the final phase.

- **Skeleton loading states**, replacing full-page-blocking
  `<PageLoader />` spinners with layout-matching skeletons on the pages
  the roadmap specifically named: `AdminDispatch.jsx` (heavy dashboard +
  the Admin Dispatch Map), `BookingDetail.jsx` (booking pages), and
  `SellerAnalytics.jsx` (heavy dashboard). Each skeleton mirrors that
  page's actual shape (stat cards, chart area, map placeholder, list
  rows) so the layout doesn't visibly jump once real data arrives.
- **Currency display for PayPal**: added a small clarifying line under
  the "Pay with PayPal" button on `SellerSubscription.jsx` and
  `VerificationFeeGate.jsx` — PayPal always charges in USD
  (`paypal.provider.js` converts every amount to USD before charging),
  while the price shown elsewhere on the page follows the seller's own
  selected display currency (which already defaults to TZS — verified,
  not changed, since `CurrencyContext.jsx` already falls back to TZS).
  This was a real gap: nothing on either page previously indicated
  PayPal doesn't charge in the displayed currency.
- **Empty states**: reviewed `AdminDispatch.jsx`, `Bookings.jsx`,
  `Orders.jsx`, and the sponsorship pages — all already have meaningful,
  specific empty-state copy ("No active deliveries right now.", not a
  generic blank list), so no changes were needed there.
- **Checkout.jsx**: reviewed — its one async section (the dynamically-
  loaded card payment methods list) already fails open gracefully
  (static payment methods stay visible; card rows simply appear a
  moment after the registry call resolves, rather than the whole form
  blocking or flashing empty), so no change was made there either.
- See `README-phase-8.md` for the full write-up, including what was
  scoped out and why.
