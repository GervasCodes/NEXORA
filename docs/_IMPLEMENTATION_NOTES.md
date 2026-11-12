# NEXORA - implementation changes (partial delivery)

Built on top of `NEXORA_1.zip`. This archive contains **only the files that were added or modified**, at their
repository paths. Unzip it over the repository root, then delete the files listed in `DELETE-THESE-FILES.txt`
(a zip cannot carry deletions), then run `npm ci` in `backend/` and `frontend/` (lock files changed).

The carousel (`frontend/src/components/HomeCarousel.jsx`) was **not touched**: it stays fully automatic with
no buttons or dots. Only its outdated accessibility test was updated to match that design.

## Verification (run in a sandbox: MariaDB 10.11, Node 22, no browser, no GitHub, no real providers)

| Check | Result |
|---|---|
| Backend unit tests | 1,870 pass; 10 fail, all in two files that came with your upload (`gatewayRouters`, `azampay.provider`) because the payment-gateway change is unfinished |
| Backend integration tests | 107 pass |
| Backend database tests (clean DB, no workaround) | 73 of 73 pass on MariaDB 10.11 (baseline: most failed as-is). MySQL 8 not run |
| Frontend tests | 558 of 558 pass |
| Backend / frontend lint | 0 errors (19 / 16 warnings, unchanged) |
| `npm audit --omit=dev` | 0 vulnerabilities in both (was 4 backend, 1 frontend) |
| Frontend production build, including shell prerender | passes |
| `docs/openapi.yaml` | validates as OpenAPI 3.0.3 and matches the code (0 missing, 0 stale) |
| GitHub Actions workflows | YAML validated only. **Never run.** |
| UI in a browser | **Not viewed** |

## What changed

**Fixes to real defects found along the way**
- Dispute SLA job never worked: it chained `.catch` onto a function that returns `undefined`, threw before marking a
  dispute as notified, repeated the first alert every 15 minutes and never reached other disputes (`jobs/disputeSla.job.js`).
- A customer's first WhatsApp support message threw a `TypeError` after saving the ticket (`support.service.js`).
  Same mistake fixed in `booking.service.js` (failed wallet reversal).
- Password reset accepted ANY new password (no validator, no check) and consumed the emailed code first.
- Three scheduled jobs were never wired in (`lowStockAlerts`, `preorderReminders`, `draftCleanup`). The scheduler is
  now one file with 27 jobs, pinned by a test. A fourth, `monetizationSchedule`, was removed with its orphaned module.
- `docs/openapi.yaml` was invalid OpenAPI, double-prefixed paths with `/api/v1`, and was missing 236 routes.
- Database test harness: stale table list and missing seller profile in fixtures (3 + 1 tests failed).
- `/db-test` debug route removed; 5 dependency advisories patched (lockfile level, no major upgrades).

**Behaviour changes to know about before deploying**
1. **Startup refuses an invalid `NODE_ENV`** (must be exactly `production`, `development` or `test`) and refuses a
   non-production process pointed at a non-local database (override: `ALLOW_NON_LOCAL_DEV_DB=true`). Confirm
   production has `NODE_ENV=production` BEFORE deploying. Production security findings (unverified database TLS,
   missing `CORS_ORIGIN`, short `JWT_SECRET`, open Selcom webhook, missing `PHONE_ENCRYPTION_KEY`, test-only
   switches) are only **warnings** unless `STRICT_SECURITY_CHECKS=true`.
2. **Password policy** for registration, change, reset and admin creation: 8 to 72 bytes, not a common password or
   trivial pattern. Existing passwords are unaffected.
3. **Unknown emails lock like real accounts** (5 failures), so lockout cannot reveal which emails exist.
4. **Sellers, delivery agents and admins land in their own area after login** when there is no `returnTo`.
5. **Saved copies:** if the API is asleep, public catalog pages show the last copy (24 h, per user) with a notice, and a
   "Refresh" button appears when new data arrives. Cart, orders, wallet, account and admin data are never saved.
6. **Start-up guard:** styled loading shell, and a clear message with a Reload button if the app has not started in 15 s.
7. Return approve/reject/receive also check the role inside the service (the routes already did).
8. `/health` also reports Redis (`ok`/`unavailable`/`disabled`); its status code still depends only on the database.
9. Removed unreferenced code: Billing Control Center, department sponsorship and loans pages, verification-fee gate,
   settings router/controller, `monetizationSchedule` module, duplicate seller wizard files.
10. `backend/.env.example` is complete and now tracked (it was git-ignored); unused `EMAIL_*` SMTP variables removed.

**Correction to earlier documentation:** in this code, commission is ALWAYS charged (platform rate, default 10%, or a
plan's rate) and sponsorship purchasing is always on. The `monetization_*_enabled` settings in the database are inert:
nothing reads them. Earlier documents said these switches default to "off"; that was wrong. The API coverage numbers in
earlier documents (289 documented / 286 undocumented) were also wrong: the baseline was 334 of 568 documented.

**New and opt-in**
- `PHONE_ENCRYPTION_KEY` (+ `_ID`, `_PREVIOUS`): dedicated key for stored payer phones. Nothing changes until it is set.
  `node scripts/reencryptPhones.js` (dry run) or `--apply` converts old values. **Back up the database first.**
- `backend/scripts/routeInventory.js` and `syncOpenApi.js`: `npm run docs:openapi:check` / `docs:openapi:sync`.
- `database/setup-test-db.js` (`npm run setup:test-db`): creates the test database on MySQL or MariaDB.
- `.github/`: CI (lint, unit, integration, API spec, DB tests on MySQL 8 and MariaDB, frontend), uptime check, Dependabot.
  The translation-literal step is report-only (651 existing hard-coded strings).

## Files
Added 33, modified 50, deleted 15. See `DELETE-THESE-FILES.txt` and the zip contents.
