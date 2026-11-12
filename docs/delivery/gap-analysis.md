# Gap Analysis

> **Update 2026-11-11.** Closed since the audit: GAP-012 (jobs scheduled, KNOWN-003), the advisories behind GAP-005, the `.env.example` omissions, the retired-gateway remnants (Snippe, MalipoPay), role-in-JWT, mandatory production security checks. Still open: GAP-008/009 (`.github`, `_headers`, `_redirects` are not in the tree), GAP-010 to GAP-016 (owner decisions), GAP-020 (no CI run, no e2e or load results), and GAP-021: every module now has service-level tests, and object-level ownership tests cover orders, bookings, disputes, saved addresses, payments, conversations and wallet payout privacy. The monetization section of GAP-011 still needs the owner's production values; the audit numbers for retired monetization operations are unchanged and unverified against production.


| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Purpose | Compare **expectation** (product claims, existing documents, stated targets) with **implementation** (what the repository actually contains), and record contradictions without silently resolving them. |

## 1. Documentation versus implementation

| ID | Source of expectation | Expectation | Reality (evidence) | Gap and disposition |
|---|---|---|---|---|
| GAP-001 | `docs/openapi.yaml` | Complete, current API contract; usable with servers list | 286 of 575 endpoints missing; inconsistent `/api/v1` prefixing; 16 operations for retired features; header says migration 082 | Regenerate or repair; add CI drift check |
| GAP-002 | `docs/DATABASE.md` | Describes the schema (MySQL 8, 159 migrations) | 160 migrations, 131 tables; ~52 tables named; detail only to migration 082; tested on MariaDB 10.11 | Superseded by `technical/database-schema.md` and `data-dictionary.md`; retire or regenerate |
| GAP-003 | `docs/SRS.md` | Stack: Nodemailer, Cloudinary | Brevo API email, 5 payment gateways, SMS, WhatsApp, AI, TRA | Update SRS to current stack |
| GAP-004 | `docs/ARCHITECTURE.md` | "40 backend modules" | 72 modules; lists retired module | Update; this audit's `architecture.md` is current |
| GAP-005 | `DEPENDENCY_UPDATE_CHANGELOG.md` | 76 suites / 1,128 tests; 0 lint errors; clean dependencies | 118 / 1,632 unit tests; 4 backend lint errors; 5 advisories | Re-baseline |
| GAP-006 | `legal and customers trust .md` | Company details exist nowhere; blocker | `frontend/src/legal/company-information.md` has legal name, registration, address fields | Owner to confirm values and update the note |
| GAP-007 | `openapi.yaml` auth description | OTP step "optional" | OTP is always required for password login | Fix spec |
| GAP-008 | `docker-compose.test.yml` comments, `SLA.md`, `UPTIME_MONITORING.md` | CI and uptime workflows exist under `.github/workflows/` | Directory absent from delivered tree (present in git index) | Recover from source repository |
| GAP-009 | `DEPLOYMENT.md` | `database/backups/` exists; `_redirects/_headers` handled | Folder absent; `frontend/public/_headers` and `_redirects` absent | Clarify; version the host config |

## 2. Product expectation versus implementation

| ID | Expectation | Reality | Disposition |
|---|---|---|---|
| GAP-010 | "Protected payments" (marketing copy) | Held-balance escrow and disputes implemented; some refunds and all payouts are manual | Align copy and policy with manual steps; document SLAs for them (Owner decision) |
| GAP-011 | Monetization (commission, plans, sponsorship) | Implemented but switched off in seed data | Owner confirms live state; document the production settings |
| GAP-012 | Low-stock alerts, pre-order reminders, draft cleanup | Jobs written, never scheduled by the live entry point | Fix scheduler (KNOWN-003) |
| GAP-013 | Verified Seller and Business verification | Workflow exists; review criteria and capacity undefined | Owner defines policy and SLA |
| GAP-014 | SLA table (uptime, webhook 30 s, responses 24 h) | No measurement in tree; dispute seller response setting is 72 h (a different measure from the 24 h admin "first response" target) | Instrument or retract; reconcile definitions |
| GAP-015 | Users control their data | Account deletion exists; no data export; retention only for verification documents | Define retention/deletion matrix; consider export |
| GAP-016 | Tanzania regulatory compliance (payments licensing, data protection, TRA) | Review document exists for escrow; no legal conclusions; EFD untested | Owner obtains legal opinion; add tests for `efd` |

## 3. Technical gaps

| ID | Area | Gap |
|---|---|---|
| GAP-020 | Delivery | No CI, no e2e run evidence, no load-test results |
| GAP-021 | Quality | 17 untested modules (`return`, `efd`, `support`, `search`, `wishlist`, etc.); 101 of 139 pages not named in FE tests |
| GAP-022 | Tests | DB-integration harness drifted from schema (KNOWN-005) |
| GAP-023 | Security | Dependency advisories; payout and phone data at rest; DB TLS verification; password policy; unverified object-level authorization (see `security-privacy.md`) |
| GAP-024 | Operations | No RTO/RPO, no incident runbook, no verified backup, no monitoring of Redis/queue in `/health` |
| GAP-025 | Config | `.env.example` incomplete and ignored by git; simulate-provider fallback depends on `NODE_ENV` |
| GAP-026 | Schema | Missing FKs on 11 plausible columns (DB-002); enum-heavy schema requires migrations for new states |
| GAP-027 | Frontend | Browser support undefined; hard-coded support contact; dead and duplicate pages; 1 failing a11y test; no role-based landing |
| GAP-028 | Scalability | Per-request DB read for auth; single primary DB; cron in web process by default |

## 4. Contradictions recorded (not resolved)

| ID | Statement A | Statement B |
|---|---|---|
| CON-001 | `openapi.yaml`: OTP optional | `login.service.js`: OTP mandatory |
| CON-002 | `legal and customers trust .md`: no company details anywhere | `company-information.md`: details present |
| CON-003 | `DATABASE.md`: MySQL 8, 159 migrations | Repo: 160 migrations, verified on MariaDB 10.11 |
| CON-004 | Changelog: 0 lint errors | Lint run: 4 backend + 8 frontend errors |
| CON-005 | Test `alertsJob.test.js` says low-stock job is scheduled hourly | Live scheduler does not contain it |
| CON-006 | `ESCROW_LICENSING_REVIEW.md` addendum mentions seller advances | Loan module absent from tree; page remains |
| CON-007 | `SLA.md` dispute first response under 24 h | `dispute_seller_response_hours` = 72 (different obligation; unclear mapping) |

## 5. Feature gaps against common marketplace expectations (Proposed, not requirements)

Seller payout automation; buyer data export; two-factor authentication beyond email OTP for admins; per-session device management; admin fine-grained permissions; automated SLA reporting; search relevance tooling beyond SQL; native apps. These are suggestions for owner prioritisation, not evidence-based defects.
