# Database

NEXORA uses MySQL 8. Schema changes live as numbered, forward-only SQL
files in `database/migrations/` (`NNN_description.sql`), applied in
order by `database/migrate.js`, which tracks what's already applied in
a `schema_migrations` table.

```bash
cd database
npm install
npm run migrate          # apply every pending migration
npm run migrate:status   # list applied vs pending
npm run seed             # populate reference/dev data
```

Connection settings (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
`DB_NAME`, plus optional `DB_SSL*` vars) are read from `backend/.env` -
see `backend/.env.example`.

## Schema overview

82 migrations as of Phase RF6 (API & Architecture Docs), grouped by
domain. This is a map of what each migration added, not a full column
reference — for exact columns, types, and constraints, read the
migration file itself (`database/migrations/NNN_*.sql`), which is the
single source of truth.

**Core catalog & accounts** (`001`–`004`)
`users`, `categories`, `seller_profiles`, `products`.

**Commerce** (`005`–`009`)
`cart_items`, `orders`, `payments`, `deliveries`, `reviews`.

**Engagement & comms** (`010`–`013`)
`notifications`, chat/`conversations` tables, delivery-aware extensions
to conversations, `seller_delivery_agents`.

**Store types & live tracking** (`014`–`017`)
`store_types`, delivery live-tracking fields, `push_subscriptions`,
wallet/commission/earnings tables (seller wallet, rider earnings).

**Payments & security hardening** (`018`–`030`)
Advanced-feature scaffolding; payment purpose + verification fields;
`otp_codes`; chat delete/clear support; FULLTEXT search + indexes on
products; password reset + `wishlists`; `fraud_flags`; conversation
delete-from-list; seller account verification; Stripe/PayPal gateway
tables (`027`, later Stripe removed in the maintenance roadmap);
`charged_currency` on payments; removal of the old seller-verification
document columns; the Snippe gateway (`030`).

**Order splitting & delivery pricing** (`031`–`039`)
Multi-vendor parent/child order splitting; delivery agent vehicle
type/plate + post-delivery ratings; Tanzania distance-band delivery
pricing; `disputes`; `audit_log`; `terms_acceptance`; delivery timeline
timestamps; `refunds`; delivery routing duration (road-routing ETA
snapshot used by the dispatch delay flag).

**Homepage & marketplace upgrade — Phases 1–5** (`040`–`043`)
`categories.cover_image_url` / `display_order` (departments, Phase 1B);
`products.is_sponsored` (Phase 2C); a price-range filter index and a
seller-region index backing the Phase 3 filters.

**Store content — Phase 6** (`044`–`047`)
Product videos, product audio, review photos, seller reply on reviews.

**Seller branding — Phase 7** (`048`–`050`)
Store theme, seller branding fields (logo/banner), seller collections.

**Sponsored marketplace — Phase 8** (`051`–`053`)
Product sponsorship campaigns, featured-store campaigns, department
sponsorship campaigns — one table family per placement type, sharing
the same admin oversight pattern (see `docs/API.md`).

**Payment trust system — Phase 9** (`054`)
Escrow foundation: the columns/table backing hold-then-release payouts
(see `docs/ESCROW_ANALYSIS.md` for the design rationale).

**Admin operations, real-time & messaging trust upgrade — Phases 1–4** (`058`–`060`)
`users.suspended_at` / `suspension_reason` / `suspended_by` (Phase 1 —
Admin Account Control: suspend/unsuspend replaces the old bare
deactivate/activate toggle; permanent delete no longer requires a prior
self-deletion); `admin_notifications` (Phase 2 — a single shared
admin-facing feed, deliberately not a reuse of the per-user
`notifications` table — see the migration file's header comment for why);
Phase 3 (PWA & Real-Time Notifications) added no new tables — it wires
the existing `push_subscriptions` (`016`) and Socket.IO `admins` room
into the new admin-notification and messaging events below; `messages`
delivery/read-receipt columns, attachment columns, `message_reactions`,
and a `(conversation_id, created_at)` index backing in-conversation
search (`060` — Phase 4, Messaging Upgrade).

Phase 5 (Audit Logs) added no new migration — it documents and extends
`audit_log` (`035`, already listed above under "Order splitting &
delivery pricing"), whose `event_type` values are now grouped for the
admin panel's filter UI in `backend/src/modules/audit/audit.constants.js`
rather than a schema change.

**Nexora Services — Phase 1, Foundation** (`062`)
`seller_profiles.merchant_type` (`product`/`service`/`hybrid` — a seller
opts into Services without a separate provider record, reusing
`seller_profiles` as CHANGES.md's "Service Provider" entity);
`service_categories` (own taxonomy from product `categories`, seeded
with the four Phase-1 categories: Accommodation, Transportation,
Tourism, Business Spaces); `services` (bookable listings — title,
pricing model, base price, location, draft/published/suspended status);
`service_media` (image/video gallery per service, mirrors
`product_images`). Availability and booking tables are intentionally
deferred to the Phase 2 (Booking Infrastructure) migration — see
`062_services_foundation.sql`'s header for the full reasoning.

**Nexora Services — Phase 2, Booking Infrastructure** (`063`)
`service_availability` (per-date `available_units`/`price` override/
`status`, one row per service per date — CHANGES.md's Availability
entity); `bookings` (the services equivalent of `orders` — a
`booking_reference` like `order_number`, the same plain `unpaid`/`paid`
`payment_status` orders use, and `status` following CHANGES.md's
Booking Lifecycle verbatim: pending → confirmed → active → completed,
with cancelled/refunded as exits); `booking_items` (one row per date
within a booking's `[start_date, end_date)` range — a 3-night hotel
stay needs 3 separate availability checks against
`service_availability`, one per night, so this is where each night's
quantity/unit_price/subtotal actually lives; a single-date booking gets
exactly one row). Full reasoning, including why this isn't a simple
`order_items` port, is in `063_services_booking_infrastructure.sql`'s
header. `provider_payouts` (escrow/payout wiring) is deferred to Phase 3
(Financial Integration).

**Monetization Master Switch & Payment Reliability** (`079`)
Four new `platform_settings` rows —
`monetization_subscriptions_enabled`, `monetization_commission_enabled`,
`monetization_sponsorship_enabled`, `monetization_verification_fee_enabled`
— stored as the strings `"true"`/`"false"`, all seeded OFF. No new
columns on `platform_settings` itself: it was already an EAV key/value
table (`017`), so these are just new rows, read via
`settings.service.js#isXMonetizationEnabled()`. **Default OFF means a
fresh launch is fully free** — sellers can subscribe to any plan, run
sponsorship/featured-store/department-sponsorship campaigns, and skip
the seller verification fee, all without a payment ever being created;
commission is a flat 0%. An admin flips each flag independently from
the new Billing Control Center (`GET/PUT /admin/monetization`) with no
redeploy or code change, and every change is recorded in the existing
`audit_logs` table (`event_type = "monetization_setting_changed"`)
rather than new tracking columns.

`monetization_schedule` (new table) — lets an admin schedule a flag
flip for a future date/time (e.g. "enable subscriptions on 1 January
2027 at 00:00") instead of only flipping it live. One row per scheduled
change, applied by a new every-minute cron job
(`jobs/monetizationSchedule.job.js`) using the same idempotent
"find due, still-pending rows" pattern `jobs/departmentMaintenanceSchedule.job.js`
(`069`) already established for department maintenance windows.

Enforcement points this migration's flags feed into (no schema change
in these files, listed here for one place to find them all):
`subscription.service.js#getEffectiveCommissionRate` (commission),
`subscription.controller.js`'s `subscribe*` actions (subscriptions),
`sponsorship`/`featuredStore`/`departmentSponsorship` `.service.js#createCampaign`
(sponsorship), and `seller.service.js#payVerificationFee` +
`middleware/requireVerificationFeePaid.middleware.js` (verification fee).

Also in this phase, no schema change: `providers/registry.js`'s
`mobile_money.isConfigured()` now calls the actively-selected mobile
money rail's own `isConfigured()` (via a new export on
`mobileMoney.provider.js`) instead of only checking that
`MOBILE_MONEY_PROVIDER` named something other than `"simulate"` — fixes
checkout showing Mobile Money as available when the real provider
credentials were missing. See `docs/PAYMENT_PROVIDERS.md`.

**Trust & Monetization Communication** (`080`)
Two new columns on `monetization_schedule` (`079`):
`reminder_3d_sent_at`, `reminder_1d_sent_at` (both `DATETIME NULL`) —
let `monetizationSchedule.job.js`'s reminder pass send a push
notification to sellers/providers 3 days and 1 day before a scheduled
billing change, exactly once each, without re-sending on every
subsequent minute-tick (see `monetizationSchedule.repository.js#findDueForReminder`).
No other schema change - the new `GET /settings/monetization-status`
endpoint (seller-facing counterpart to the admin-only
`GET /admin/monetization`) reads the same `platform_settings` rows
`079` already added.

**Nexora AI foundation — Phase B1** (`081`)
`ai_usage_log` (new table) — one row per AI provider call, not a running
counter, the same append-only reasoning as `wallet_transactions`/
`audit_log`. Lets the spend guard (`ai.service.js#checkSpendGuard`) sum
tokens over any window (today, this month) with a plain `SUM` query, and
gives admins a real trail if usage needs investigating later. `user_id` is
nullable because several B1 endpoints (FAQ chat, smart search) are public
and only personalize if a buyer happens to be signed in (same "optional
buyer" shape as `recommendation.controller.js`) — anonymous usage still
counts toward the *global* cap, just not any per-user one. `feature` is a
short tag (`chat` / `search` / `recommend` / `order_status`) for future
per-feature usage/cost reporting, not enforced anywhere yet. Two supporting
indexes: `(user_id, created_at)` and `(created_at)`, backing the spend
guard's two query shapes ("this user, since `<date>`" and "everyone, since
`<date>`").

No new settings table — the AI master switch and the four spend caps live
as five new rows in the existing `platform_settings` EAV table (`017`):
`ai_enabled`, `ai_daily_token_cap_per_user`, `ai_monthly_token_cap_per_user`,
`ai_daily_token_cap_global`, `ai_monthly_token_cap_global`. See
`settings.service.js` `DEFAULTS` for the fallback values on an environment
that hasn't run this migration yet.

**Red-flag remediation — DB indexing (`RF4`)** (`082`)
One new composite index, no new tables: `orders (buyer_id, created_at)`,
backing `order.repository.js#findOrdersByBuyer`'s
`WHERE buyer_id = ? AND parent_order_id IS NULL ORDER BY created_at DESC`.
Before this migration, `orders.buyer_id` only had the single-column index
InnoDB creates implicitly for its FK constraint — enough to find a buyer's
rows, but MySQL still had to sort them by `created_at` afterwards (a
filesort) once a buyer's order history grew. Verified against a real MySQL
instance seeded with ~32,000 orders: `EXPLAIN` moved from
`type: index_merge` + `Using filesort` to `type: ref` + no filesort. See
`README-phase-RF4.md` for the full before/after `EXPLAIN` output.

Deliberately **no equivalent seller-side index** in this migration —
`findOrdersBySeller` filters via a JOIN on `order_items.seller_id` (already
indexed via its own FK constraint) and only reaches `orders.created_at`
*after* that join, with a `DISTINCT` on top: a different enough query shape
that a composite index on `orders` itself wouldn't be used the same way.
That one needs its own `EXPLAIN` investigation against real data volume
before proposing an index, not a guess.

## Connection pool (RF4)

`backend/src/config/db.js`'s mysql2 pool size is configurable via
`DB_POOL_CONNECTION_LIMIT` (falls back to `10` if unset — default
behavior is unchanged from before RF4). The pool emits mysql2's
`enqueue` event exactly when a query has to wait for a free connection
instead of getting one immediately; this is wired to `logger.warn` +
`Sentry.captureMessage` (tagged `area: db-pool`), throttled to once per
30 seconds so a sustained burst produces one alert, not a flood. Treat
that warning, not a guess, as the signal for when
`DB_POOL_CONNECTION_LIMIT` needs raising — and note that your DB
provider's own total-connection ceiling applies across your whole
account, so raising this on a multi-instance deployment multiplies per
instance rather than adding once. See `docs/DEPLOYMENT.md`'s
Observability section for the full detail.

## Caching (Redis, RF5)

Category/department listings and product browse/search results
(`category.service.js#listPublic/listDepartments/getDepartmentBySlug`,
`product.service.js#listProducts` and its filter-metadata endpoints) are
read through `backend/src/utils/cache.js`, backed by
`backend/src/config/redis.js` (`ioredis`, only active when `REDIS_URL`
is set — no Redis in local dev/CI, no code path changes without it).
TTL is 30–60s (default `45`, via `CACHE_TTL_SECONDS`). This is a caching
layer in front of the schema below, not a schema change — RF5 added
**no migration**. Keys are versioned (`<namespace>:v<version>:<...>`);
a write bumps the namespace's version counter rather than deleting
individual keys, orphaning every previously-cached entry for that
namespace at once. Product detail, cart, checkout, payments, wallet,
and all admin/seller-only listings are deliberately **not** cached —
see `README-phase-RF5.md` for the full scope table and the reasoning
behind each exclusion.

## Testing against the database

The backend has three Jest suites (`backend/jest.config.js` /
`backend/jest.db.config.js`), each with a different relationship to
MySQL:

| Suite | Location | What's real | What's mocked |
|---|---|---|---|
| Unit | `backend/tests/unit/` | Pure logic | The DB pool, external providers |
| Integration | `backend/tests/integration/` | Express app, routing, middleware | The `mysql2` pool |
| DB-integration | `backend/tests/db-integration/**/*.db.test.js` | Real SQL against a real MySQL 8 instance | Only external boundaries (email transport, payment provider network calls, fraud/audit/socket side-effects) |

Only the third suite needs MySQL actually running. It exists to catch
what a fully-mocked pool never can: a typo'd column name, a broken
`JOIN`, a foreign-key/constraint violation, or a transaction that
doesn't actually roll back on error.

### Running the DB-integration suite locally (Docker)

A disposable MySQL container backs this suite - nothing to install,
and it never persists real data between runs.

```bash
# 1. Start the disposable MySQL container.
docker compose -f docker-compose.test.yml up -d

# 2. Apply migrations to nexora_test.
npm --prefix backend run db:migrate

# 3. Run the suite.
npm --prefix backend run test:db

# 4. Tear the container down when done (drops the tmpfs data too).
docker compose -f docker-compose.test.yml down -v
```

`docker-compose.test.yml`'s credentials/port match `tests/setupEnv.js`'s
fallback defaults (`DB_HOST=localhost`, `DB_PORT=3306`,
`DB_USER=test`/`DB_PASSWORD=test`, `DB_NAME=nexora_test`), so no
`backend/.env` file is required to run the suite locally. The
container's data directory is `tmpfs`, so it's always rebuilt clean
from migrations on the next `up -d` - just `down -v` and `up -d` again
for a totally fresh database.

### CI (Phase 3)

`.github/workflows/backend-tests.yml` runs a MySQL 8 `services:`
container for every push/PR, waits for it to accept connections, runs
every pending migration against it, then runs all three backend
suites (`test:unit`, `test:integration`, `test:db`) plus the frontend
Vitest suite and a `vite build` in a separate job. `BREVO_API_KEY` is
intentionally left unset in CI - `backend/src/config/brevo.js` falls
back to a simulated (no-network) send outside `NODE_ENV=production`,
so no test run ever emails a real inbox.

### Fixture conventions

`backend/tests/db-integration/helpers/dbFixtures.js` holds shared
fixture creators (`createUser`, `createProduct`, `createOrder`,
`createOrderItem`, `createCartItem`, `createPayment`, `createDispute`)
and a `resetTables()` cleanup helper. Every db-integration test file
calls `resetTables()` in a `beforeEach` - the suite shares one
long-lived database rather than spinning up a fresh schema per test,
so tests must never assume they're the only row in a table.

`resetTables()` deletes in child-before-parent order to respect
foreign keys. When a migration adds a new table that a db-integration
test writes to, add it to that list (as a child of whatever it
references) rather than reaching for `TRUNCATE` / disabling FK checks.
