# NEXORA Deployment Guide

This covers taking NEXORA from a fresh checkout to a running instance, in
both a local/dev environment and a production environment.

## 1. Prerequisites

- Node.js 18+ and npm
- MySQL 8+ (or MariaDB 10.6+)
- A Cloudinary account (for product/store image uploads)
- An SMTP account for transactional email (optional — the app degrades
  gracefully to "log and continue" if email isn't configured)
- Mobile money merchant credentials, **if** you intend to accept real mobile
  money payments (see section 5 — this is not wired up yet)

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

## 4. Frontend setup

```bash
cd frontend
cp .env.example .env
# set VITE_API_URL to point at your backend, e.g. https://api.yourdomain.com/api/v1
npm install
npm run dev      # local development
npm run build    # production build (outputs to frontend/dist)
```

Serve `frontend/dist` behind your usual static host / reverse proxy (Nginx,
Vercel, Netlify, etc.), pointed at the backend's public URL.

## 5. Before accepting real payments

`backend/src/modules/payment/providers/mobileMoney.provider.js` is the
single place mobile money calls go through. It has three modes:

- **Configured** (all four `MOBILE_MONEY_*` vars set) → calls the real
  provider via `callRealProvider`, which is currently a **placeholder
  request/response shape** — every provider (M-Pesa, Tigo Pesa, Airtel
  Money, or an aggregator) has its own API contract, so you'll need to
  replace the body of that function with the real integration once you've
  picked a provider.
- **Unconfigured + `NODE_ENV` not `production`** → simulates a successful
  payment (with a loud, unmissable `SIMULATED-...` log banner) so you can
  build/test checkout without real credentials.
- **Unconfigured + `NODE_ENV=production`** → **throws**, and the payment is
  recorded as failed rather than silently succeeding. This is intentional:
  it makes it impossible to accidentally deploy to production still in
  "always succeeds" mode.

Before going live:

1. Get merchant/API credentials from your provider.
2. Set `MOBILE_MONEY_API_BASE_URL`, `MOBILE_MONEY_API_KEY`,
   `MOBILE_MONEY_API_SECRET`, `MOBILE_MONEY_MERCHANT_CODE` in `backend/.env`.
3. Replace `callRealProvider`'s request/response mapping with the real
   provider's API.
4. Add a webhook/callback route if the provider confirms payment
   asynchronously (most mobile money APIs do) — see the `TODO` comment at
   the top of `mobileMoney.provider.js`.

Cash on Delivery (`confirmCashOnDelivery`) doesn't depend on this and is
safe to use as-is.

## 6. Pre-launch checklist

- [ ] Migrations applied and `npm run migrate:status` in `database/` shows
      nothing pending
- [ ] Initial admin account created and its password changed after first login
- [ ] `JWT_SECRET` is a long random value, unique to this environment
- [ ] `CORS_ORIGIN` set to your real domain(s), not left as `*`
- [ ] Cloudinary and SMTP credentials set (SMTP can be left blank if you're
      okay with emails being skipped — see `sendEmail.js`)
- [ ] Real mobile money provider wired in (section 5) — until then, `NODE_ENV=production`
      makes mobile money fail closed rather than silently simulate, but you
      should still disable/hide it at checkout until it's real
- [x] The `/db-test` debug route now requires an authenticated admin — no
      further action needed, listed here as a record of the fix
- [ ] Regular database backups configured (`database/backups/` exists as a
      placeholder but nothing populates it automatically yet)
- [ ] No automated tests exist yet for auth, checkout, or payment flows —
      consider adding at least smoke coverage for those before launch

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
