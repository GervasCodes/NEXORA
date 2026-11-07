# Current-State Audit

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Documentation version | 1.0 |
| Subject | `NEXORA.zip` as delivered (working tree; git history unreliable, see KNOWN-004) |
| Auditor method | Static inspection plus the executions listed in section 2. All other judgements are static. |

## 1. Application snapshot (Verified)

| Item | Value |
|---|---|
| Packages | `backend/` (Node/Express 5), `frontend/` (React 18/Vite 7), `database/` (migrations and tools), `docs/` |
| Size | Backend about 68k lines, frontend about 65k lines, 160 migrations |
| API | 575 route declarations in 68 route files (66 mounted in `app.js` plus 2 stock sub-routers) and 14 app-level routes; 72 backend modules |
| Frontend | 159 route entries, 139 page files, 158 components, English and Swahili |
| Data | 131 application tables, 1,392 columns, 209 foreign keys, 471 indexes |
| Background work | 24 scheduled jobs (live scheduler) and one BullMQ queue |
| Integrations | 5 payment providers, Brevo, SMS, WhatsApp, Cloudinary, OSRM, TRA VFD, 5 AI providers, Redis, ClamAV, Sentry |

## 2. Checks executed in this audit

| # | Check | Result |
|---|---|---|
| 1 | Applied all 160 migrations (project runner) to a clean MariaDB 10.11.14 | **Pass**, 160 applied |
| 2 | Backend unit tests (Jest, `tests/unit`) | **Pass**: 118 suites, 1,632 tests |
| 3 | Backend integration tests (`tests/integration`, Supertest) | **Pass**: 11 suites, 96 tests |
| 4 | Backend DB-integration tests against a real DB | **Fail**: with stock tables cleared between files, 69 of 73 tests pass; 4 fail (KNOWN-005). Run as-is, most files fail from fixture cleanup. |
| 5 | Frontend tests (Vitest) | **1 failing** test: 82 of 83 files, 476 of 477 tests pass (KNOWN-006) |
| 6 | Frontend production build (`vite build`) | **Pass** (about 18 s). The `postbuild` prerender step was not run. |
| 7 | Backend boot against the migrated DB and probes | **Pass**: `/health` 200, `/` 200, `/api/v1/store-types` 200, `/categories` 200, `/products` 200, `/status` 200, `/me` 401, `/admin/users` 401 |
| 8 | Backend lint | **4 errors, 19 warnings** |
| 9 | Frontend lint | **8 errors, 16 warnings** |
| 10 | `npm audit --omit=dev` | **5 advisories** (3 high) (KNOWN-011) |
| 11 | Secret-pattern scan of the tree | No matches |
| 12 | Static endpoint reconciliation against `openapi.yaml` (paths normalised) | 286 of 575 undocumented; 16 spec operations with no code, all in retired features; 1 unmounted router (live probe: 404) |
| 13 | Playwright e2e, load tests, `postbuild` prerender, real-provider calls | **Not executed** |

Environment limits: sandbox with MariaDB (not MySQL 8), no Redis, no browsers, no provider credentials. A throwaway database and fake local secrets were used; no data from the owner was touched.

## 3. Feature status

Legend: **Working** = code present and exercised by passing tests or probes. **Partial** = works with a verified defect or untested key path. **Unverified** = code present, no execution evidence. **Missing** = expected but not found. **Retired** = intentionally removed.

| Area | Status | Basis |
|---|---|---|
| Registration, login (two-step OTP), lockout, sessions, CSRF | Working | unit, integration and DB tests pass |
| Google sign-in | Unverified | no test located |
| Catalog, product and service browsing | Working (basic probes); search Unverified | probes 200; `search` untested |
| Seller product management and media | Working (unit/FE tests) | tests pass |
| Cart and checkout (single and multi-vendor) | Partial | unit and FE tests pass; DB tests fail on fixture drift (probable) |
| Payments via providers and webhooks | Working in tests; real providers Unverified | webhook unit and integration tests pass |
| Escrow hold and release, wallet ledger, COD commission | Working | DB tests pass (5 + 4) |
| Withdrawals and manual payout | Working (12 DB tests pass); real payouts manual | by design |
| Refunds | Working (6 DB tests) ; manual completion by design | |
| Disputes | Working (unit, FE) | |
| Returns | Unverified | no tests for `return` module |
| Delivery dispatch, tracking, offers | Working (unit, socket tests); real-world Unverified | |
| Services and bookings | Working (7 DB tests, FE tests) | |
| Chat and notifications | Working (DB, integration, unit tests) | |
| Reviews | Working (unit) | |
| Verification and KYC | Working (unit), `kyc` partly untested | |
| Admin console and audit | Working (unit, DB) ; many admin pages not in FE tests | |
| Subscriptions, sponsorship, featured store | Working in tests; **disabled by default**. Scheduled switch flips and the Billing Control Center are **not available** in this tree (KNOWN-021) | settings |
| Stock and POS | **Partial** | tests pass; hourly low-stock alert and daily draft cleanup jobs are not scheduled (KNOWN-003) |
| Pre-orders | **Partial** | reminders job not scheduled |
| Group buys, live selling, affiliate, loyalty | Working (group buy, affiliate, referral tests); live selling Unverified | |
| AI features | Working in tests (mocked); real provider Unverified | |
| TRA tax receipts (EFD) | Unverified | no tests; simulate provider exists |
| Public status page | Working (unit) | |
| SEO sitemap and prerender shells | Working (unit tests); prerender not run here | |
| Department sponsorship, loans | **Retired** with remnants (KNOWN-009) | |
| API documentation | **Defective** | KNOWN-001, 002 |
| CI/CD and uptime monitoring | **Missing from delivered tree** | KNOWN-004 |
| Data export for users, retention policy, RTO/RPO, browser matrix | **Missing** | gap analysis |

## 4. Technical debt and risks (summary)

1. Repository integrity and missing CI (KNOWN-004). 2. Unscheduled jobs and a misleading test (KNOWN-003). 3. Security advisories and hardening items (KNOWN-011, SECF-02..13). 4. Documentation drift (KNOWN-008). 5. Untested money-adjacent modules (`return`, `efd`) and test-harness drift (KNOWN-005, 015). 6. Dead code and duplicates (KNOWN-009, 010). 7. Manual payout and refund operations (KNOWN-017).

## 5. Positive findings

Consistent module layering; fail-closed webhook authentication; ledger-based money model with reconciliation; strong unit test base (about 2,270 passing tests across the suites executed); migrations apply cleanly to an empty database; i18n parity between languages; graceful degradation without Redis; documented operational thinking (`DEPLOYMENT.md`, `ESCROW_*`, `ROLLBACK.md`).

## 6. Unresolved decisions

Which monetization switches are live; whether production uses MySQL 8 or MariaDB; whether the three unscheduled jobs are intended; what to do with retired features' tables; payout automation versus manual process; legal position on held balances.
