# NEXORA

## Phase 3 — Order Splitting (multi-vendor carts)

A buyer's cart can hold products from more than one seller. Checkout now
handles that properly instead of forcing every seller's items into one
order with one shared status:

- **Single-vendor cart** → unchanged: one standalone order, exactly as
  before.
- **Multi-vendor cart** → one **parent order** (buyer-facing: payment,
  shipping address, combined total) plus one **child order per vendor**
  (that vendor's items only, its own status, its own delivery). Child
  order numbers are the parent's number with `-V1`, `-V2`, ... appended.

This means each vendor can now progress their own part of the order
(processing → shipped → delivered) independently, and each gets its own
delivery assignment — previously a multi-vendor cart could only ever have
one delivery row for the whole order, so only one seller could ever
actually get it shipped.

Paying once (mobile money / card / PayPal) pays the parent; on webhook
confirmation the payment status cascades to every child order and
sellers are credited per child order exactly as before. Cash on
Delivery is confirmed per child order already, since each child has
exactly one seller.

**Migration required:** run `node database/migrate.js` before deploying
this build — adds `parent_order_id` and `is_parent` to `orders`.

**Known limitation carried into a later phase:** a parent order's own
`status` column isn't kept in sync with its children's individual
statuses (it only ever moves to `cancelled`) — the buyer-facing detail
page shows each vendor's real status on its own card, but nothing yet
computes a single rolled-up "order status" for the parent. Revisit this
if/when the admin order list or notifications need a one-line summary
status for split orders.

---

## Pre-launch audit

Full pass over the codebase looking for anything that would break at
launch: broken routes, dead links, config gaps, and security holes.
Backend was syntax-checked file-by-file, its full require graph was
loaded (every route file's controllers/middleware actually resolve),
and the frontend was production-built clean. Every route→controller
wire-up and every `<Link>`/`navigate()` target in the frontend was
cross-checked against declared routes — **no broken routes or missing
page components found.**

The real issues were all in configuration and security, not routing.
In order of severity:

## 1. CRITICAL — Payment webhooks had no authentication
`POST /api/v1/payments/webhooks/malipopay` and `.../webhooks/selcom`
accepted **any** POST request with no verification of who sent it.
Concretely, anyone who found the URL could run:

    POST /api/v1/payments/webhooks/malipopay
    { "reference": "ORDER-123", "status": "SUCCESS" }

...and order #123 (or a seller's verification fee) would be marked paid
with no money having moved. This is the single most serious finding —
exploitable, no special access needed, directly affects money.

**Fixed**: added `webhookAuth.middleware.js`, which checks a shared
secret sent as an `x-webhook-secret` header, applied to both webhook
routes. **Fails closed in production** — if the secret env var isn't
set, the webhook is rejected, not silently allowed through.

**Action needed from you**: set `MALIPOPAY_WEBHOOK_SECRET` and/or
`SELCOM_WEBHOOK_SECRET` in your backend `.env`, and configure your
provider to send that same value as a custom header on their webhook
callback (check their dashboard for "custom headers" on the callback
URL). If MalipoPay/Selcom instead sign requests with HMAC (many
providers do), that's strictly stronger than a static secret — swap
this out for verifying their real signature once you have their actual
webhook documentation or sandbox access.

## 2. CRITICAL — Mobile money payments will hard-fail at launch
`MOBILE_MONEY_PROVIDER` is read by the code (`providers/mobileMoney.provider.js`)
but was **never set** in your `.env`. The code deliberately fails closed
in production: with `NODE_ENV=production` and no provider selected,
**every** checkout and **every** seller verification fee payment throws
`"Mobile money is not configured for production"`. Right now this is
silently masked because `NODE_ENV=development`, which falls back to a
simulated provider — the moment you flip to `NODE_ENV=production` for
the real launch, payments break for everyone with no code change
needed to trigger it.

Nothing to fix in code here — your MalipoPay credentials
(`MOBILE_MONEY_API_BASE_URL`, `MOBILE_MONEY_API_KEY`) are already
populated in `.env`, which strongly suggests MalipoPay is the intended
provider.

**Action needed from you**: add `MOBILE_MONEY_PROVIDER=malipopay` to
your production `.env` before going live. (If you're actually using
Selcom instead, use `MOBILE_MONEY_PROVIDER=selcom` and also set
`MOBILE_MONEY_VENDOR_ID`, which Selcom requires and which isn't
currently in your `.env` either.)

## 3. HIGH — No `trust proxy` setting (breaks rate limiting on Render)
Render (like any PaaS) puts your app behind a reverse proxy. Without
`app.set("trust proxy", 1)`, Express's `req.ip` resolves to the proxy's
own IP for every single visitor — meaning the rate limiter would count
*all* your real users' combined traffic against one shared bucket.
Practical effect: normal traffic from a handful of real users could
trip the general rate limit and lock out the entire site within
minutes of going live, or (depending on how express-rate-limit
validates this) requests could start erroring outright.

**Fixed**: added `app.set("trust proxy", 1)` in `app.js` — trusts
exactly one hop (Render's own proxy), not the full forwarding chain,
which is what prevents someone from spoofing their own IP via a fake
header.

## 4. HIGH — `DB_SSL` / `DB_SSL_REJECT_UNAUTHORIZED` were set in `.env` but never read
Three separate copies of the DB connection SSL logic existed (`backend/src/config/db.js`,
`database/migrate.js`, `database/seed.js`), and all three only checked
for a CA certificate file/content — never the `DB_SSL` or
`DB_SSL_REJECT_UNAUTHORIZED` variables that were actually sitting in
your `.env`. Most managed MySQL (PlanetScale, Aiven, RDS, DigitalOcean
managed DB) requires SSL but doesn't hand you a CA file to pin - the
usual pattern there is exactly `DB_SSL=true` +
`DB_SSL_REJECT_UNAUTHORIZED=false`, which is what you had set, and
which was being silently ignored. Depending on your host's policy this
would have meant either the app failing to connect to the database at
all, or connecting unencrypted despite `DB_SSL=true` clearly signaling
otherwise.

**Fixed**: all three now respect `DB_SSL=true` (falls back to
`rejectUnauthorized: false` unless you also set
`DB_SSL_REJECT_UNAUTHORIZED=true`), while still preferring a real CA
cert (`DB_SSL_CA_PATH`/`DB_SSL_CA`) if you provide one — that path is
unchanged and is the stronger option.

## 5. MEDIUM — Socket connections accepted pre-2FA tokens
`auth.middleware.js` (REST) already rejects the short-lived tokens
issued mid-login-OTP-flow or mid-password-change (they carry a `typ`
claim specifically so they can never be used as a real session). The
Socket.io auth handshake never had the same check — meaning a leaked
pre-auth token (issued the moment someone enters email+password,
*before* they've entered their OTP code) could open a live socket
connection to that user's private channel, ahead of 2FA actually
completing.

**Fixed**: socket auth now rejects any token carrying a `typ` claim,
matching the REST-side rule exactly.

## 6. MEDIUM — No process-level crash safety net
Nothing caught `unhandledRejection` or `uncaughtException` at the
process level. A single uncaught async error anywhere outside a normal
request/response cycle (a socket handler, something in a future
fire-and-forget call that's missing a `.catch()`) would silently crash
the entire Node process for every user on the site, with no log trail
to diagnose what happened.

**Fixed**: `server.js` now logs `unhandledRejection`s (recoverable,
keeps running) and logs + exits cleanly on `uncaughtException` (Node's
own guidance is not to keep running after a truly uncaught synchronous
exception, since process state may be corrupted) — Render restarts the
process automatically after an exit, so this trades "silent full
outage" for "brief logged restart." Also added a `pool.on("error", ...)`
handler in `db.js` so a dropped DB connection at the pool level logs
instead of potentially tripping the new `uncaughtException` handler
over what's usually just a transient network blip.

## 7. LOW — `.env.example` never existed
Multiple files (`migrate.js`'s own docstring, several inline comments)
referenced `backend/.env.example` as if it existed — it didn't. Not a
functional bug, but exactly the kind of gap that causes real friction
the first time you redeploy from scratch, rotate a secret, or hand this
off to anyone else.

**Added**: `backend/.env.example` and `frontend/.env.example`, built
from an actual grep of every `process.env.X` / `import.meta.env.VITE_X`
reference in the codebase — not guessed, verified against what the code
actually reads. Also caught and fixed one thing while building it: a
frontend `.env.example` draft I wrote initially assumed a
`VITE_VAPID_PUBLIC_KEY` build-time var, but the actual code fetches
that key from the backend at runtime — corrected before finalizing.

## Confirmed fine, no action needed
- `.env` is properly gitignored and was **never** committed to git
  history (checked full history, not just the current tree)
- No SQL injection surface — every single query in the codebase uses
  parameterized `?` placeholders
- No XSS surface — zero uses of `dangerouslySetInnerHTML` anywhere in
  the frontend; React's default escaping covers the rest
- Global Express error handler exists and is mounted last, after all
  routes, as it should be
- Health check endpoint (`/health`) exists and actually checks DB
  connectivity rather than just returning 200 unconditionally
- `start` script correctly points to `server.js`
- Migration runner is idempotent (tracks applied migrations in a
  `schema_migrations` table) and all 25 migration files are
  sequentially numbered with no gaps or collisions

## Also noticed, not a bug
`MOBILE_MONEY_MERCHANT_CODE` is set in your `.env` but isn't referenced
anywhere in the code — harmless, just unused. Left it alone since
removing env vars from your real `.env` wasn't part of this pass and
it's not hurting anything.

---

# Phase 4 — Delivery improvements

Adds vehicle info to delivery agent registration and lets buyers rate
the agent who delivered their order. No new environment variables and
no new API base paths - everything below lives under the existing
`/api/v1/auth` and `/api/v1/delivery` routes.

**Migration required:** run `node database/migrate.js` before
deploying this build - it adds two columns to `users` and a new
`delivery_ratings` table (migration
`032_delivery_agent_vehicle_and_ratings.sql`).

## 1. Vehicle type + plate number at registration
Delivery agents now submit their vehicle type (bicycle, motorcycle,
tuktuk, car, van, or truck) and plate number as part of the same
"verify your identity" step that already collects their ID and
driver's license - no new registration step, no separate form.
Buyers/sellers never see or send these fields; they're required only
when `role = "delivery_agent"` (enforced server-side in
`auth.validator.js`, not just hidden in the UI).

Where it shows up afterwards:
- **The buyer**, while tracking a live delivery on the order page, now
  sees "David is on a Motorcycle · Plate T123 ABC" above the map.
- **The agent**, via `GET /account/me` (their own profile).
- **Admins**, reviewing a pending delivery agent's registration in
  Account Verifications, see the declared vehicle/plate alongside the
  uploaded documents - useful context when deciding whether to approve.

## 2. Delivery agent ratings
Once a delivery's status is `delivered`, the buyer who placed that
order can leave a 1-5 star rating (with an optional comment) for the
agent who delivered it - exactly one rating per order, mirroring how
product reviews work (one review per buyer per product). The buyer
sees a star-picker on the order page immediately after delivery, and
their own submitted rating (read-only) on every visit after that.

Agents see their own ratings on a new **Ratings** tab in their
dashboard: average rating, total count, and the individual
ratings/comments they've received, newest first.

## New API endpoints
| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/v1/delivery/:orderId/rating` | Buyer (order owner) | Rate the agent who delivered this order. Only once, and only after `delivered`. Body: `{ rating: 1-5, comment?: string }`. |
| GET | `/api/v1/delivery/my/rating-summary` | Delivery agent | The logged-in agent's own average rating, count, and rating history. |

`GET /api/v1/delivery/:orderId` (existing route) now also returns the
assigned agent's `agent_vehicle_type` / `agent_vehicle_plate_number` /
`agent_first_name` / `agent_last_name`, plus a `rating` field (`null`
until the buyer rates it) - no new route needed for the buyer to see
either of those.

## What was completed
- Migration adding `vehicle_type` / `vehicle_plate_number` to `users`
  and the new `delivery_ratings` table.
- Registration validation, service, and repository changes so vehicle
  info is required and stored for `delivery_agent` signups only.
- Vehicle info surfaced in the agent's own profile, the buyer's live
  tracking view, and the admin verification review screen.
- Full rate-a-delivery flow: repository, service (with the
  buyer-owns-order / delivered-only / one-rating-only checks),
  controller, validator, and routes.
- Agent-facing ratings dashboard tab + page.

## What remains
- Nothing outstanding from this phase - Phase 4 is complete as
  scoped (vehicle type, plate number, delivery agent ratings).
- Not in scope for this phase, flagging for later phases per the plan:
  Phase 5 (distance-based delivery pricing for Tanzania), Phase 6
  (disputes), Phase 7 (legal/policy pages), Phase 8 (Swahili), Phase 9
  (animations/UX polish), Phase 10 (automated tests).


## Phase 1 — Payments: Stripe removed, Snippe added
Stripe has been fully removed and replaced with a new **Snippe**
provider. Payment providers remain isolated (one file per gateway under
`payment/providers/`), and PayPal / mobile money / cash-on-delivery are
unaffected.

**Changed**:
- `providers/stripe.provider.js` deleted, `providers/snippe.provider.js`
  added — same hosted-checkout-session shape (`isConfigured`,
  `createCheckoutSession`, `constructWebhookEvent`), no SDK dependency
  (plain `fetch`, same pattern already used for PayPal). Webhook
  authenticity is verified via an HMAC-SHA256 signature
  (`SNIPPE_WEBHOOK_SECRET`) over the raw request body, same trust model
  Stripe had.
- `payment.service.js` / `payment.controller.js` / `payment.routes.js` /
  `app.js`: every Stripe-specific function, route, and webhook handler
  renamed/rewired to Snippe (`/payments/:orderId/snippe/checkout`,
  `/payments/verification-fee/snippe/checkout`,
  `/payments/webhooks/snippe`).
- `orderStatus.js`'s `PAYMENT_METHODS` now lists `snippe` instead of
  `stripe`.
- Frontend (`Checkout.jsx`, `OrderDetail.jsx`,
  `VerificationFeeGate.jsx`, `AdminSettings.jsx`): UI labels and API
  calls updated to Snippe.
- `backend/package.json`: `stripe` npm dependency removed.
- New migration `030_snippe_payment_gateway.sql`: widens then narrows
  the `payment_method`/`method` ENUMs so any existing `'stripe'` rows
  are moved to `'snippe'` rather than left pointing at a gateway the app
  no longer understands.

**Action needed from you**:
- Set `SNIPPE_SECRET_KEY` and `SNIPPE_WEBHOOK_SECRET` in your production
  `.env` (placeholders added, both currently empty) — checkout and the
  seller verification fee will error on the Snippe path until these are
  set.
- Verify Snippe's actual hosted-checkout API shape (endpoint path,
  request/response field names, webhook signature header name) against
  their real docs once you're onboarded — `snippe.provider.js` follows a
  common hosted-checkout pattern but wasn't built against Snippe's
  actual documentation, since none was available at the time of this
  change.
- Run the new migration (`npm run db:migrate` from `backend/`) before
  deploying.
- Run `npm install` in `backend/` to drop `stripe` from
  `package-lock.json` (not hand-edited, since lockfiles should be
  regenerated by npm, not patched by hand).

## Phase 2 — Emails: Nodemailer removed, Brevo used everywhere
Nodemailer/SMTP has been fully removed. Every outgoing email (OTP *and*
general notifications) now goes through the Brevo HTTPS API.

**Changed**:
- `config/email.js` (the Nodemailer transporter) deleted.
- `utils/sendEmail.js` (used by `notification.service.js` for order/
  status-change emails) now calls `config/brevo.js`'s
  `sendTransactionalEmail` instead of a Nodemailer transporter. Same
  best-effort behavior as before — a failed send is logged, not thrown,
  so a broken email config never breaks the feature that triggered it.
  OTP delivery (`otp.service.js`) already used Brevo directly and is
  unchanged.
- `backend/package.json`: `nodemailer` dependency removed.
- `backend/.env`: `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` /
  `EMAIL_PASSWORD` (SMTP-only) removed. `EMAIL_FROM` kept as a fallback
  sender address, alongside the existing `BREVO_API_KEY` /
  `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME`, now all under one
  "Transactional email" section.

**Action needed from you**:
- Nothing new — `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` were already set
  and working for OTP, and now cover general notification emails too.
- Run `npm install` in `backend/` to drop `nodemailer` from
  `package-lock.json`.
