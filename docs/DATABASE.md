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

60 migrations as of Phase 7 (Documentation) of the admin/notification/
messaging trust upgrade, grouped by domain. This is a map of what
each migration added, not a full column reference — for exact columns,
types, and constraints, read the migration file itself
(`database/migrations/NNN_*.sql`), which is the single source of truth.

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
