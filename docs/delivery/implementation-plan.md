# Implementation Plan

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Status of every item | **Proposed. Nothing here has been started or completed.** |
| Effort | Sized **S** (under a day), **M** (a few days), **L** (a week or more) for one engineer who knows the codebase. These are rough relative sizes, **not estimates**: team, environment and priorities are unknown. No hour or cost figures are given. |
| Sources | `operations/known-issues.md` (KNOWN-nnn), `technical/security-privacy.md` (SECF-nn), `delivery/gap-analysis.md` (GAP-nnn) |

## Phase 0 - Recover and baseline (before any change)

| ID | Task | Outcome / acceptance | Size | Depends on | Risk |
|---|---|---|---|---|---|
| WI-001 | Recover the full source repository (complete git history, `.github/`, missing modules and docs). Decide whether the delivered tree or git HEAD is authoritative. | `git status` runs; CI files restored; a list of intentional deletions (department sponsorship, loans) agreed | M | Owner access to the original remote | Losing the 244 untracked files if overwritten (KNOWN-004) |
| WI-002 | Commit the current working tree to a new branch as the baseline; tag it. | Reproducible baseline | S | WI-001 | none |
| WI-003 | Confirm what runs in production (commit, env, DB engine and version, which jobs). | Owner Confirmation items BUS-Q2, Q3 resolved | S | Owner | Production may differ from this tree |

## Phase 1 - Critical fixes

| ID | Task | Acceptance criteria | Size | Source |
|---|---|---|---|---|
| WI-010 | Merge `jobs.index.js` into `jobs/index.js`; schedule `lowStockAlerts`, `preorderReminders`, `draftCleanup`; delete the duplicate; make `alertsJob.test.js` assert the live file. Decide with the owner whether to schedule `monetizationSchedule` (only useful if the admin scheduling endpoints are restored, WI-016). | `startJobs()` registers the agreed set; test fails if a job is removed | S | KNOWN-003 |
| WI-016 | Mount `settings.routes.js` (or remove `BillingStatusBanner`), and decide whether to restore the Billing Control Center and its `/admin/monetization` endpoints or delete the page, OpenAPI entries and `monetization_schedule` remnants. | `GET /settings/monetization-status` returns 200 for signed-in users, or the banner and spec are removed; probe test added | S-M | KNOWN-021 |
| WI-011 | Patch dependencies: `multer`, `body-parser`, `qs`, `ip-address`, `follow-redirects`; re-run all suites. | `npm audit --omit=dev` shows 0 high; test suites unchanged | S-M | KNOWN-011 |
| WI-012 | Add `NODE_ENV` assertion and refuse simulate providers when production-like (non-local DB host). | Boot fails with a clear message when misconfigured | S | SECF-13 |
| WI-013 | Fix `openapi.yaml` double prefix and OTP description. | Spec loads in Swagger UI with correct URLs | S | KNOWN-001, CON-001 |
| WI-014 | Decide payout/refund manual process: document four-eyes, turnaround and audit; or schedule automation. | Written procedure signed off by owner | M | KNOWN-017 |
| WI-015 | Obtain legal opinion on held balances and data protection. | Written conclusion stored with docs | M (external) | BUS-Q7, PRIV-002 |

## Phase 2 - Essential improvements

| ID | Task | Acceptance criteria | Size | Source |
|---|---|---|---|---|
| WI-020 | Repair DB-integration harness: complete `resetTables()` from FK metadata, create `seller_profiles` in fixtures, make `setup-test-db.sql` MariaDB- and MySQL-compatible. | `npm run test:db` passes all 73 tests on a clean DB, repeatedly | M | KNOWN-005 |
| WI-021 | Restore and run CI: backend unit, integration, DB tests (service container), frontend tests, lint, build, `npm audit`, migration-drift check. | Pipeline green on the baseline branch | M | KNOWN-004, 014 |
| WI-022 | Fix lint errors (4 backend, 8 frontend) and the failing HomeCarousel a11y test. | `eslint` 0 errors; Vitest all pass | S | KNOWN-006, 007 |
| WI-023 | Generate API and schema docs from code in CI (OpenAPI from routes/validators; schema dump from migrated DB); fail on drift. | CI step compares route table to spec | M-L | KNOWN-002, 008 |
| WI-024 | Add tests for `return`, `efd`, `support`, `wishlist`, `search`, `pickupPoint`; start with `return` and `efd`. | Each module has unit tests for its main service paths | M | KNOWN-015 |
| WI-025 | Object-level authorization review and tests (orders, bookings, documents, conversations, wallets, deliveries). | A test per resource proving another user gets 403/404 | M | SECF-14 |
| WI-026 | Review the 32 interpolated SQL statements; introduce an allow-listed dynamic-update helper. | No raw dynamic column names from request data; tests for helper | M | SECF-12 |
| WI-027 | Complete and version `.env.example` (all variables, no secrets); remove unused `EMAIL_*`. | Tracked file; envCheck lists any variable read but undocumented | S | KNOWN-012 |
| WI-028 | Remove or archive dead code: department sponsorship remnants, `SellerLoans`, orphan admin pages, duplicate wizard; decide DB table fate with owner. | No unreferenced pages; build and tests pass | S-M | KNOWN-009, 010 |

## Phase 3 - Production readiness

| ID | Task | Acceptance criteria | Size |
|---|---|---|---|
| WI-030 | Security hardening: dedicated encryption key and encrypt payout destinations; DB TLS verification; admin session hardening; password policy; mandatory Selcom IP allow-list; remove `/db-test`; fail on unset `CORS_ORIGIN` in production. (SECF-02..11) | Each item has a test or a config check in `envCheck` | L |
| WI-031 | Operations: documented backups with restore drill, RTO/RPO, incident runbook, Redis and queue health in `/health`, external uptime monitor. | A restore from backup demonstrated in a staging environment | M-L |
| WI-032 | Run Playwright e2e and load tests in CI or staging; record baseline latency and error rates. | Reports stored; thresholds agreed | M |
| WI-033 | Version host configuration (Render headers, redirects, CSP) in the repo. | Reproducible from the repo | S |
| WI-034 | Define data retention and deletion matrix; implement missing cleanup jobs; consider user data export. | Policy approved; jobs and tests exist | M-L |
| WI-035 | Pen test before live payments (SEC-R10). | Report with remediation tracked | external |
| WI-036 | Settle SLA definitions and instrument them (webhook latency, response times) or retract the published numbers. | Metrics visible to admins | M |

## Phase 4 - Future enhancements (owner to prioritise)

Seller payout automation; admin two-factor and fine-grained permissions; role-based landing after login (UX-P04); browser support matrix and low-bandwidth mode review; user data export; search relevance improvements; multi-country configuration if expansion is intended; schema hardening (add missing FKs, review enum use); per-session management; caching of account status for scale.

## Milestones

| Milestone | Exit criteria |
|---|---|
| M0 Baseline | WI-001..003 done |
| M1 Safe to deploy | Phase 1 done; CI green (WI-021) |
| M2 Quality baseline | WI-020, 022, 024, 025, 026 done |
| M3 Launch ready | Phase 3 done and owner confirmation items closed |

## Key dependencies and risks

Owner access to the original repository and production; legal advice timing; provider sandbox credentials for realistic tests; the risk that production runs different code than this tree (WI-003 resolves it).
