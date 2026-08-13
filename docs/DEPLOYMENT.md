# NEXORA Deployment Guide

This covers taking NEXORA from a fresh checkout to a running instance, in
both a local/dev environment and a production environment.

## 1. Prerequisites

- Node.js 18+ and npm
- MySQL 8+ (or MariaDB 10.6+)
- A Cloudinary account (for product/store image uploads)
- A Brevo account and API key for transactional email (OTP login, account
  notifications) — sent over Brevo's HTTPS API, not SMTP. Optional in
  non-production: the app degrades gracefully to "log and continue" if it
  isn't configured
- Merchant/API credentials for whichever payment providers you intend to
  accept live traffic on (Selcom and/or MalipoPay for direct mobile money,
  Snippe for hosted card/mobile-money/QR checkout, PayPal) — see section 5

## 2. Database setup

Create an empty database and a user with privileges on it:

```sql
CREATE DATABASE nexora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'nexora_user'@'%' IDENTIFIED BY 'change-me';
GRANT ALL PRIVILEGES ON nexora.* TO 'nexora_user'@'%';
FLUSH PRIVILEGES;
```

### 2.1 Run migrations

Migrations live in `database/migrations/` as numbered `.sql` files, applied
in order and tracked in a `schema_migrations` table so re-running is safe.

```bash
cd database
npm install               # one-time, installs mysql2/bcrypt/dotenv for the scripts
npm run migrate:status    # see what's pending
npm run migrate           # apply everything pending
```

(You can also run these from `backend/` via `npm run db:migrate`, which
proxies into `database/`.)

This creates, in dependency order: `users` → `categories` →
`seller_profiles` → `products`/`product_images` → `cart_items` → `orders`/
`order_items` → `payments` → `deliveries` → `reviews` → `notifications` →
`conversations`/`messages`.

> The old loose files in `database/schema/` are kept for reference but are
> superseded by `database/migrations/`. Don't run both against the same
> database — `admin_columns.sql` in particular is now folded directly into
> the `001`/`003`/`004` migrations, so applying it afterwards would try to
> add duplicate columns.

### 2.2 Seed reference data + first admin account

```bash
cd database
npm run seed
```

This inserts the default product categories, and — if `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, and `ADMIN_PHONE` are set in `backend/.env` — creates a
single initial admin account so you have a way to log in and manage the
platform on a brand-new database. It's safe to re-run; it skips anything
that already exists.

## 3. Backend setup

```bash
cd backend
cp .env.example .env
# edit .env with real DB credentials, JWT_SECRET, Cloudinary keys, etc.
npm install
npm run dev      # local development (nodemon)
npm start        # production
```

Required environment variables are documented inline in
`backend/.env.example`. At minimum you must set: `DB_HOST`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, and the three `CLOUDINARY_*` keys
(product/store image upload will fail without them). `CORS_ORIGIN` should
be set to your real frontend URL(s) in production — the API and the
socket.io server both fall back to `*` (allow any origin) if it's left
unset, which is fine for local dev only.

### 3.1 Scheduled jobs: in-process (default) or a dedicated worker

By default `npm start` runs the HTTP server *and* every scheduled job
(escrow release, booking lifecycle, sponsorship expiry, etc. — see
`backend/src/jobs/index.js`) in the same process, exactly as before
Phase 4 — no extra setup needed for a single-instance deployment.

To scale the web process horizontally (2+ instances) without
multiplying job runs, move jobs to a separate process instead — see
`docs/SCALABILITY_REPORT.md` §1-2 for the full design:

```bash
# On the web process(es):
RUN_JOBS_IN_PROCESS=false npm start

# As a separate process/service (e.g. a second Render service, a
# second Docker container, a second PM2 process) pointed at the SAME
# database:
npm run worker
```

A per-job MySQL advisory lock (`src/utils/dbLock.js`) makes it safe to
run more than one worker replica too, or to leave `RUN_JOBS_IN_PROCESS`
unset alongside a running worker during a migration — only one instance
ever actually executes a given job tick either way.

## 4. Frontend setup

```bash
cd frontend
cp .env.example .env
# set VITE_API_URL to point at your backend, e.g. https://api.yourdomain.com/api/v1
npm install
npm run dev      # local development
npm run build    # production build (outputs to frontend/dist, cleaned first - see below)
```

`npm run build` always clears `frontend/dist/` before building
(`prebuild` script + Vite's `emptyOutDir`) — if your deploy pipeline
copies `frontend/dist` elsewhere, make sure that step doesn't skip
cleaning the destination too, or a stale previous build's chunks can
linger alongside the new ones (see `docs/SCALABILITY_REPORT.md` §4 for
the bug this guards against).

Serve `frontend/dist` behind your usual static host / reverse proxy (Nginx,
Vercel, Netlify, etc.), pointed at the backend's public URL.

## 5. Before accepting real payments

`backend/src/modules/payment/providers/mobileMoney.provider.js` is a
**router**, not a placeholder: it dispatches to a real, complete provider
implementation based on `MOBILE_MONEY_PROVIDER` in `.env`.

- `MOBILE_MONEY_PROVIDER=selcom` → `selcom.provider.js` (needs
  `MOBILE_MONEY_API_BASE_URL`, `MOBILE_MONEY_API_KEY`,
  `MOBILE_MONEY_API_SECRET`, `MOBILE_MONEY_VENDOR_ID`)
- `MOBILE_MONEY_PROVIDER=malipopay` → `malipopay.provider.js` (needs
  `MOBILE_MONEY_API_BASE_URL`, `MOBILE_MONEY_API_KEY`)
- Both providers implement `initiate`/`disburse`/webhook verification for
  real, and each has a working inbound webhook route
  (`POST /api/v1/payments/webhooks/selcom`,
  `POST /api/v1/payments/webhooks/malipopay`), guarded by
  `webhookAuth.middleware.js`.
- **Unconfigured + `NODE_ENV` not `production`** → falls back to
  `simulate.provider.js` (a loud, unmissable `SIMULATED-...` log banner) so
  you can build/test checkout without real credentials.
- **Unconfigured + `NODE_ENV=production`** → **throws**, and the payment is
  recorded as failed rather than silently succeeding — you cannot
  accidentally ship production still in "always succeeds" mode.

Separately, `snippe.provider.js` and `paypal.provider.js` are independent,
complete payment methods (Snippe is a hosted checkout covering
card/mobile-money/QR; needs `SNIPPE_SECRET_KEY`, `SNIPPE_WEBHOOK_SECRET`,
`SNIPPE_API_BASE_URL`; PayPal needs the standard PayPal REST credentials
plus `PAYPAL_MODE=live` when you're ready). Both verify their own inbound
webhooks with a raw-body signature check.

Before going live:

1. Pick a mobile money provider (Selcom and/or MalipoPay), get its
   merchant/API credentials, and set the vars above in `backend/.env`.
2. If you want Snippe and/or PayPal as additional checkout options, get
   their credentials and set those vars too.
3. Point each provider's webhook URL (in their merchant dashboard) at your
   deployed `POST /api/v1/payments/webhooks/<provider>` route.
4. Confirm `NODE_ENV=production` is set — this is what turns off payment
   simulation.

Cash on Delivery (`confirmCashOnDelivery`) doesn't depend on any of this and
is safe to use as-is.

## 6. Pre-launch checklist

- [ ] Migrations applied and `npm run migrate:status` in `database/` shows
      nothing pending (39 migrations as of this report)
- [ ] Initial admin account created and its password changed after first login
- [ ] `JWT_SECRET` is a long random value, unique to this environment
- [ ] `CORS_ORIGIN` set to your real domain(s), not left as `*`
- [ ] Cloudinary credentials set for image uploads
- [ ] Brevo API key set for transactional email (OTP login, notifications) —
      email is sent via Brevo's HTTPS API, not SMTP
- [ ] At least one real payment provider configured and its webhook URL
      registered with the provider (section 5) — until then,
      `NODE_ENV=production` makes payments fail closed rather than silently
      simulate, but you should still disable/hide unconfigured methods at
      checkout
- [ ] `MOBILE_MONEY_PROVIDER`, `SNIPPE_*`, `PAYPAL_*` env vars set for
      whichever providers you enabled
- [ ] Regular database backups configured (`database/backups/` exists as a
      placeholder but nothing populates it automatically yet)
- [x] Automated test coverage exists and passes: 390 backend unit tests, 15
      backend integration tests, and 101 frontend tests as of this report
      (`cd backend && npm test`, `cd frontend && npm test`) — still
      recommended to add the DB-integration suite (`npm run test:db`)
      against a real MySQL instance in CI before each deploy
- [ ] Road-routing provider (OSRM) reachable in production if you want
      real road distance/ETA instead of the straight-line fallback (see
      `docs/ROUTING.md`)
- [ ] `SENTRY_DSN` set (backend `.env`) and `VITE_SENTRY_DSN` set
      (frontend `.env`) for error tracking — see "Observability" below.
      Optional but recommended; the app runs fine without it, you just
      won't get alerted to production errors

## 6.5 Observability

- **Error tracking (Sentry):** set `SENTRY_DSN` in `backend/.env` and
  `VITE_SENTRY_DSN` in `frontend/.env` (get both from the same Sentry
  project's Client Keys page, or separate backend/frontend Sentry
  projects if you want them tracked apart). Unset by default — the app
  runs identically either way, you just won't get error alerts. See
  `backend/src/config/sentry.js` and `frontend/src/main.jsx`.
- **Structured logs:** the backend logs JSON (via `pino`) instead of
  free-text `console.log` — set `LOG_LEVEL` (`debug`/`info`/`warn`/
  `error`) to control verbosity, defaults to `info` in production. On
  Render (or any host that captures stdout), these show up as-is in the
  log viewer; pipe them to a log aggregator if you want search/alerting
  beyond what Sentry covers.
- **Uptime:** see `docs/UPTIME_MONITORING.md`.
- **DB connection pool:** `DB_POOL_CONNECTION_LIMIT` (defaults to `10`,
  same as before this setting existed) sets how many concurrent MySQL
  connections the backend's pool holds — see
  `backend/src/config/db.js`. If you start seeing `"db pool saturated -
  a query had to wait for a free connection"` warnings in your logs (or
  a matching Sentry event, tagged `area: db-pool`), that means real
  concurrent traffic is exceeding this limit and requests are queueing
  behind it. Before just raising the number: check your MySQL provider's
  own max-connections limit first (Aiven's free/starter plans cap total
  connections platform-wide, not just what one app can request), and
  raise `DB_POOL_CONNECTION_LIMIT` with headroom under that ceiling —
  every backend process/instance gets its own pool of this size, so with
  N backend instances the real total is `N × DB_POOL_CONNECTION_LIMIT`.

## 7. Running everything together (local dev)

From the repo root, in two terminals:

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm run dev
```

Visit the frontend dev URL (Vite prints this, typically
`http://localhost:5173`). The backend listens on `PORT` from `backend/.env`
(default `5000`), with the API mounted under `/api/v1` and a
`GET /db-test` route to confirm the database connection.
