# Deployment and Environment Guide

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Basis | `package.json` scripts, `database/*.js`, `.env.example`, config code, and the existing `docs/DEPLOYMENT.md` (read in full only for sections cited). Steps marked **Verified** were executed in the audit sandbox. Production deployment steps are **Stated** by existing docs and were not performed. |
| Rule | Never commit real secrets. All values below are placeholders. |

## 1. Prerequisites

| Item | Requirement |
|---|---|
| Node.js | 18 or newer declared; **22.x verified** |
| npm | 10 or newer (Verified with Node 22) |
| Database | MySQL 8 (stated) or MariaDB 10.6+ (**10.11.14 verified**), utf8mb4 |
| Redis | Optional (cache, durable delivery-offer expiry) |
| `mysqldump` | Needed by `database/backup.js` |
| Provider accounts | Needed only for the integrations you enable (see `technical/integrations.md`) |

## 2. Local development (Verified except the frontend dev server)

```bash
# 1. Database (example with local server; adapt user/password)
mysql -uroot -e "CREATE DATABASE nexora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
                 CREATE USER 'nexora'@'localhost' IDENTIFIED BY '<choose-a-password>';
                 GRANT ALL ON nexora.* TO 'nexora'@'localhost';"

# 2. Backend configuration
cd backend
cp .env.example .env        # then edit; see section 3
npm ci                      # add PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 if browser downloads are blocked

# 3. Migrations and first admin (reads backend/.env)
npm run db:migrate          # applies database/migrations/*.sql in order (160 files)
npm run db:migrate:status   # shows applied/pending
npm run db:seed             # default categories; creates first admin if ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_PHONE are set

# 4. Run
npm run dev                 # API on PORT (default 5000), jobs run in-process
npm run worker:dev          # optional: separate worker (then set RUN_JOBS_IN_PROCESS=false on the web process)

# 5. Frontend
cd ../frontend
cp .env.example .env        # set VITE_API_URL and VITE_SOCKET_URL
npm ci
npm run dev                 # Vite dev server (not executed in the audit)
```

Notes: `db:migrate` and `db:seed` invoke `database/` scripts, which need `npm install` there (the root scripts use `npm --prefix ../database`; run it once if modules are missing). `backend/.env.example` is git-ignored in this repo (KNOWN-012), so keep a copy.

## 3. Environment variables (names only)

Required to start (`envCheck.js`): `JWT_SECRET`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. In production also `MOBILE_MONEY_PROVIDER`. Use a long random `JWT_SECRET`; it also keys payer-phone encryption (SECF-02), so do not rotate it casually.

### Backend

| Group | Variables |
|---|---|
| Core | `NODE_ENV`, `PORT`, `FRONTEND_URL`, `CORS_ORIGIN` (set explicitly), `TRUST_PROXY_HOPS`, `LOG_LEVEL`, `RUN_JOBS_IN_PROCESS` |
| Database | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_POOL_CONNECTION_LIMIT`, `DB_SSL`, `DB_SSL_CA`, `DB_SSL_CA_PATH`, `DB_SSL_REJECT_UNAUTHORIZED`, optional read replica `DB_READ_*` |
| Redis | `REDIS_URL`, `REDIS_DISABLED`, `REDIS_TLS_REJECT_UNAUTHORIZED`, `CACHE_TTL_SECONDS` |
| Auth | `JWT_SECRET`, `GOOGLE_CLIENT_ID` |
| Seed | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PHONE` (read by `database/seed.js`) |
| Payments | `MOBILE_MONEY_PROVIDER`, `MOBILE_MONEY_API_BASE_URL`, `_API_KEY`, `_API_SECRET`, `_VENDOR_ID`; `SELCOM_WEBHOOK_SECRET`, `SELCOM_WEBHOOK_ALLOWED_IPS`; `AZAMPAY_*`; `SNIPPE_*`; `MALIPOPAY_CARD_*`; `PAYPAL_CLIENT_ID`, `_CLIENT_SECRET`, `_MODE`, `PAYPAL_WEBHOOK_ID`; `PAYMENT_ENABLE_SNIPPE`, `PAYMENT_ENABLE_PAYPAL`, `PAYMENT_AMOUNT_TOLERANCE_PERCENT`, `PAYMENT_RECONCILIATION_DAYS`, `STALE_*_MINUTES` |
| Messaging | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_WEBHOOK_SECRET`; `SMS_GATEWAY_*`; `WHATSAPP_*`; `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; `SUPPORT_EMAIL` |
| Media/security | `CLOUDINARY_CLOUD_NAME`, `_API_KEY`, `_API_SECRET`; `CLAMAV_HOST`, `CLAMAV_PORT`; `DOCUMENT_URL_TTL_SECONDS` |
| Routing/tax | `OSRM_BASE_URL`, `OSRM_PROFILE`, `OSRM_TIMEOUT_MS`, `ROUTING_PROVIDER`, `ROUTING_FALLBACK_ENABLED`; `TRA_VFD_BASE_URL`, `TRA_VFD_API_KEY` |
| AI | `AI_PROVIDER`, `AI_MODEL`, `AI_PROVIDER_BASE_URL`, and one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` |
| Observability | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE` |
| Dangerous (non-production only) | `ALLOW_UNSIGNED_WEBHOOKS`, `ALLOW_PLATFORM_DATA_RESET`, `ALLOW_PLATFORM_DATA_RESET_REAL`, `LOADTEST_BYPASS_TOKEN`. Never set these in production. |
| Ops | `RENDER_DEPLOY_HOOK_URL` |

Variables the code reads but `.env.example` omits are listed in `technical/integrations.md` INT-G1; `EMAIL_*` in the example are unused.

### Frontend (build time)

`VITE_API_URL` (includes `/api/v1`), `VITE_SOCKET_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `VITE_GA_MEASUREMENT_ID`, `VITE_GSC_VERIFICATION`, `VITE_LEGACY_PRODUCT_FORM`.

### Safe example (placeholders only)

```
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=nexora
DB_PASSWORD=<set-locally>
DB_NAME=nexora
JWT_SECRET=<at-least-32-random-characters>
REDIS_DISABLED=true
```

## 4. Build

```bash
cd frontend
npm run build          # vite build (Verified, about 18 s); postbuild runs scripts/prerender-shells.mjs (not executed in audit)
npm run preview        # serve the build locally
```

The backend has no build step (`npm start` = `node server.js`).

## 5. Production deployment (Stated in `docs/DEPLOYMENT.md`; not performed)

| Component | Stated setup |
|---|---|
| API | Render Web Service (stated). The guide does not list exact build/start commands or a health-check path. **Proposed:** root `backend/`, build `npm ci`, start `npm start`, health check `/health` (the endpoint returns 200/503 and is built for Render's monitor, per its code comment) |
| Worker | Optional second service running `npm run worker` against the same DB; set `RUN_JOBS_IN_PROCESS=false` on the API |
| Frontend | Render Static Site, base directory `frontend`, build `npm run build`, publish `dist` (stated, `docs/DEPLOYMENT.md` lines 135-136). Redirects/rewrites (SPA fallback) and security headers are set in the dashboard, not versioned. `PRERENDER_BODY=0` disables body prerendering in the build. |
| Database/Redis | Aiven MySQL and Redis with TLS |
| Domain and HTTPS | Not in the repository. If the API and site are on different registrable domains, cookies need `SameSite=None; Secure`, which the app sets in production. Raise `TRUST_PROXY_HOPS` when adding a CDN. |
| Pre-launch checklist | `docs/DEPLOYMENT.md` sections 5 and 6 and `docs/SECURITY_REVIEW_CHECKLIST.md` |

Recommended release order: back up the database, run `npm run db:migrate:status`, apply migrations, deploy API and worker, deploy frontend, smoke-test `/health`, `/api/v1/status` and a login. Migrations are forward-only; there are no down scripts.

## 6. Rollback

See `docs/ROLLBACK.md`: code rollback via Render deploys (does not revert the database), database restore from backup for schema or data problems. Because migrations are forward-only, roll back code only when the migrations already applied are backward-compatible; otherwise restore.

## 7. Verification after deployment (Proposed checklist)

`GET /health` returns `ok`; `GET /api/v1/status` healthy; login with the seeded admin then change its password; payments in sandbox mode complete and webhooks arrive; one scheduled job log line per expected tick; Sentry receives a test event; frontend loads, language toggle works, PWA installs.

## 8. Known deployment issues

KNOWN-004 (missing CI and host config), KNOWN-012 (`.env.example`), KNOWN-019 (backup folder), SECF-04, SECF-13.
