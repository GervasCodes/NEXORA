# Technical Requirements Specification

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Basis | `package.json` files, `.env.example`, config code, and what actually ran in the audit sandbox. Version ranges are **declared**; resolved versions are in the lock files. |

## 1. Technology stack (Verified from manifests)

| Layer | Technology |
|---|---|
| Runtime | Node.js. `engines` declares `>=18` (backend). The audit ran on **Node 22.22.2**. CommonJS in backend, ES modules in frontend. |
| Backend framework | Express `^5.2.1` with express-validator `^7.3.2`, helmet `^8.3.0`, cors, compression, cookie-parser, express-rate-limit `^8.5.2` |
| Database | MySQL-compatible. `docs/DEPLOYMENT.md` and `docs/DATABASE.md` say MySQL 8 (Aiven). **Verified working**: MariaDB 10.11.14 (all 160 migrations; unit, integration and boot checks). Driver `mysql2 ^3.22.5`. |
| Cache / queue | Redis (optional) via `ioredis ^6`; `bullmq ^6.3.1` for delayed dispatch jobs |
| Realtime | `socket.io ^4.8.3` |
| Auth | `jsonwebtoken ^9.0.3`, `bcrypt ^6.0.0` (cost 10), `google-auth-library ^11` |
| Files | `multer ^2.2.0`, `sharp ^0.35.5` (image processing/sanitising), `cloudinary ^2.10`, `clamscan` (optional AV), `pdfkit` (documents), `fflate` |
| Scheduling | `node-cron ^4.6.0` |
| Observability | `pino`/`pino-http`, `@sentry/node ^10.69` |
| Push | `web-push ^3.6.7` (VAPID) |
| Frontend | React `^18.3.1`, React Router `^7.18.2`, Vite `^7.3.6`, Tailwind `^3.4.17`, Axios, socket.io-client, Leaflet/react-leaflet, react-helmet-async, qrcode.react, `@sentry/react` |
| Test tooling | Jest `^30.5.2`, Supertest (backend); Vitest `^4.1.11`, Testing Library, jest-axe, Playwright `^1.62` (frontend), Artillery (load) |
| Quality tooling | ESLint 8 (both), `eslint-plugin-jsx-a11y`, custom i18n literal check |

## 2. Hosting and infrastructure

| Item | Finding | Status |
|---|---|---|
| Intended hosting | Render web service, optional separate Render worker, Render Static Site for the frontend, Aiven MySQL and Redis | **Stated** in `docs/DEPLOYMENT.md`; no infrastructure-as-code (`render.yaml`, Dockerfile, compose file for the app) exists in the delivered tree; production not verified |
| Containers | None for the app. `docker-compose.test.yml` provides a MySQL 8.0 test database only. | Verified |
| Process model | `server.js` (HTTP + sockets; runs cron in-process unless `RUN_JOBS_IN_PROCESS` is false) and `worker.js` (cron + BullMQ worker, no HTTP). MySQL advisory locks (`GET_LOCK`) make jobs safe with several replicas. | Verified (code) |
| TLS to database | `DB_SSL`, `DB_SSL_CA`, `DB_SSL_CA_PATH`; with only `DB_SSL=true` the certificate is **not** validated unless `DB_SSL_REJECT_UNAUTHORIZED=true` | Verified |
| Read replica | Optional `DB_READ_*` pool (`config/dbRead.js`) | Verified (config) |
| Reverse proxy | `trust proxy` hops from `TRUST_PROXY_HOPS` (default 1, for Render). Must be raised if Cloudflare is added. | Verified |
| Domain, HTTPS, CDN | The domain `nexoramarketplace.online` is referenced in 19 places (the API as `api.nexoramarketplace.online`, the site on `www.`): `docs/FRONTEND_CSP.md`, `frontend/index.html`, `frontend/src/api/client.js`, `utils/seo.js`, `prerender-shells.mjs`, `backend/src/app.js`, `sessionCookie.js`, email templates. DNS, TLS and CDN configuration were not verified. | Stated; Owner Confirmation Required |

## 3. Browser and device support

**Not defined anywhere in the repository** (NFR-007). Vite's default build target applies. The UI is responsive (Tailwind defaults), installable as a PWA, and uses Web Push, which needs a service-worker-capable browser (iOS requires an installed PWA).

## 4. Non-functional requirements

| ID | Requirement | Evidence / status |
|---|---|---|
| NFR-001 | Per-IP API limit 600 / 15 min; auth routes 20 / 15 min; username check 30 / min | Verified in `rateLimit.middleware.js` |
| NFR-002 | Uptime 99.5% monthly (published) | Stated in `docs/SLA.md`; its monitor, `.github/workflows/uptime-check.yml`, is **absent** from the delivered tree |
| NFR-003 | Payment webhook processing under 30 s | Stated; not measured |
| NFR-008 | DB pool default 25 connections (`DB_POOL_CONNECTION_LIMIT`); saturation warnings logged | Verified |
| NFR-009 | Every authenticated request costs one DB read (account status) plus a throttled `last_active_at` write every 5 min | Verified; a scalability consideration |
| NFR-010 | Frontend production build time about 18 s; main chunk 321 kB (90 kB gzip) | Verified by `vite build`; prerender step not run |
| NFR-011 | Graceful degradation without Redis: cache bypass; dispatch expiry non-durable | Verified (config/boot log) |
| NFR-012 | Load tests exist (`backend/loadtest/nexora-load-test.yml`, `docs/SCALABILITY_REPORT.md`) | Not executed; results not verified |
| NFR-013 | Accessibility: WCAG level not declared | Not defined |

## 5. Configuration requirements

Required at startup (`envCheck.js`): `JWT_SECRET`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`; in production also `MOBILE_MONEY_PROVIDER`. Full variable list and notes: `operations/deployment-guide.md`.

## 6. Constraints and assumptions

- Single MySQL primary is the system of record; no sharding. Money movements rely on transactions and row locks (see db tests).
- Fixed currency model: TZS default; USD only for payout conversion and PayPal.
- Foreign cookies: production sessions use `SameSite=None; Secure`, so the frontend and API are expected on different sites, and CORS must list the frontend origin (`CORS_ORIGIN`; defaults to `*` if unset, which `.env.example` warns against).
- Installed `npm ci` required `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` in a network-restricted environment (artillery pulls Playwright).

## 7. Known technical-requirement gaps

No browser matrix; no stated RTO/RPO; no performance budget beyond bundle size notes; no capacity assumptions (users, orders per day); no data-retention periods other than the document-retention setting. Owner Confirmation Required for each.
