# Testing and QA Plan

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Status vocabulary | **Passed** = executed by this audit and passed. **Failed** = executed and failed. **Existing, not executed** = exists in the repo, not run here. **Proposed** = does not exist; recommended. Actual results are stated only for executed items. |

## 1. Existing test assets (Verified)

| Level | Tool and location | Size | Executed here | Result |
|---|---|---|---|---|
| Backend unit | Jest, `backend/tests/unit` (`npm run test:unit`) | 118 suites, 1,632 tests | Yes | **Passed** |
| Backend integration | Jest + Supertest, `backend/tests/integration` | 11 suites, 96 tests | Yes | **Passed** |
| Backend DB integration | Jest, `backend/tests/db-integration` (`npm run test:db`, real MySQL) | 11 files, 73 tests | Yes (MariaDB) | 69 passed, **4 failed** after neutralising a cleanup defect; most files fail as-is (KNOWN-005) |
| Frontend unit/component/a11y | Vitest + Testing Library + jest-axe, `frontend/tests` | 83 files, 477 tests | Yes | 476 passed, **1 failed** (KNOWN-006) |
| Frontend e2e | Playwright, `frontend/e2e` (checkout, home, product-detail) | 3 specs | No | Existing, not executed (no browsers) |
| Load | Artillery, `backend/loadtest/nexora-load-test.yml` | 1 scenario file | No | Existing, not executed |
| Lint / i18n | ESLint (both), `lint:i18n` | n/a | Lint yes; i18n script no | 4 + 8 errors |
| Dependency audit | `npm audit` | n/a | Yes | 5 advisories |
| Migration drift | `database/checkMigrationDocsDrift.js` | n/a | No | Existing, not executed |

## 2. Test strategy (Proposed)

| Level | Goal | Targets |
|---|---|---|
| Unit | Business rules and money maths | Keep; add `return`, `efd`, `support`, `wishlist`, `search`, `pickupPoint` |
| API integration | Contract and guards | Generate from OpenAPI once fixed; add role-matrix tests (every guarded route rejects other roles) |
| DB integration | Transactions, locks, ledger invariants | Repair harness first; keep as release gate |
| End-to-end | Core journeys in a real browser against staging | Buyer purchase, seller listing and payout request, delivery handover, admin dispute resolution |
| Regression | Prevent known issues recurring | Scheduler-contents test (KNOWN-003), cart-join test, OpenAPI drift test |
| Accessibility | WCAG 2.1 AA target (to be confirmed by owner) | axe in CI plus manual keyboard and screen-reader pass |
| Performance | Baseline p95 latency and error rate on list/search/checkout/webhook endpoints | Artillery against staging with realistic data |
| Security | Object-level authorization, injection review, dependency scan, pen test | See `security-privacy.md` |
| Usability | Sellers and agents on low-end Android and slow networks | Moderated sessions |

## 3. Test cases

Format: ID, requirement, preconditions, steps, expected result, **status and actual result**.

### 3.1 Existing automated cases (mapped, with actual results)

| ID | Requirement | Preconditions | Steps | Expected | Status / actual |
|---|---|---|---|---|---|
| TST-001 | FR-001 / US-001 | Clean DB | Register with missing/invalid fields, then valid | 400 with messages; valid creates user | `auth.register.db.test.js`, `auth.login.test.js`: **Passed** |
| TST-002 | FR-002 | Existing user | Login with wrong then correct password; verify OTP | 401 then pre-auth token then session after OTP | `auth.login.db.test.js` (7), `login.service.test.js`: **Passed** |
| TST-003 | FR-003 / US-002 | Existing user | Fail login 5 times; again to next tier | 429 `ACCOUNT_LOCKED` 5 then 15 then 60 min | `auth.lockout.test.js`, `loginLockout.service.test.js`: **Passed** |
| TST-004 | FR-004/005 | Session cookie | Send unsafe request without/with matching CSRF header | 403 / success | `auth.sessionCookie.test.js`, middleware unit tests: **Passed** |
| TST-005 | FR-031 / US-004 | Pending payment | Send valid, invalid and replayed webhooks | Valid completes once; invalid rejected; replay ignored | `payment.webhooks.test.js`, `.resilience.test.js`, `webhookReplayGuard.test.js`, `webhookAuth.*`: **Passed** |
| TST-006 | FR-033 / US-005 | Paid order, seller | Credit seller; credit again | Held balance up once; idempotent | `wallet.creditSellersForOrder.db.test.js` (5): **Passed** |
| TST-007 | BR-025 | COD order | Confirm receipt | Balance credited, commission debited | `wallet.codCommission.db.test.js` (4): **Passed** |
| TST-008 | FR-034 / US-006 | Seller with balance | Request withdrawals below/above limits, over balance, with open disputes | Rejections per BR-040..043; no orphan rows | `wallet.requestWithdrawal.db.test.js` (12): **Passed** |
| TST-009 | FR-062 / US-007 | Dispute with payment | Auto-refund success, provider decline, no payment | Row states per BR-032 | `refund.autoRefundForDispute.db.test.js` (6): **Passed** |
| TST-010 | FR-051 / US-008 | Service with availability | Book multi-date; fail one date; cancel | Atomic decrement; rollback; restore | `booking.repository.db.test.js` (7): **Passed** |
| TST-011 | FR-070 | Conversation | Participant sends; outsider sends | Allowed / rejected | `chat.messaging.db.test.js` (7): **Passed** |
| TST-012 | US-010 | Active user | Admin suspends; user calls API | 403 `ACCOUNT_SUSPENDED` | `admin.accountManagement.db.test.js` (10): **Passed** |
| TST-013 | FR-021 / US-003 | Seeded cart | Checkout single and multi-vendor; double submit | Orders created; stock decremented once | `orders.checkout.db.test.js`, `concurrency.db.test.js`: 6 of 10 passed, **4 failed** ("Your cart is empty", fixtures lack `seller_profiles`) |
| TST-014 | FR-041 | Delivery flow | Dispatch, offers, rematch | Per rules | `delivery.service.test.js`, `deliveryPricing`, routing: **Passed** |
| TST-015 | FR-070 sockets | Auth tokens | Connect with bad/good token; presence | Rejected / accepted | `socket.auth.test.js`, `socket.presence.test.js`: **Passed** |
| TST-016 | SEC-008 | Upload files | Disguised and valid files | Rejected / accepted | `fileContentValidation.middleware.test.js`, `fileContentValidator.test.js`: **Passed** |
| TST-017 | PRD-018 | AI configured/mocked | Chat, parse, explain, caps | Per limits | `ai.routes*.test.js`, `unit/ai`: **Passed** |
| TST-018 | NFR-004 | Rendered pages | axe on key pages | No violations | `keyPages.a11y.test.jsx`: 1 **Failed** (HomeCarousel) |
| TST-019 | Boot | Migrated DB | Start server, probe endpoints | 200 public, 401 protected | Manual probe: **Passed** (section 4) |

### 3.2 Proposed cases (not yet implemented, not executed)

| ID | Requirement | Preconditions | Steps | Expected |
|---|---|---|---|---|
| TST-101 | KNOWN-003 | Live scheduler module | Load `jobs/index.js` with a stubbed cron; list job names | Contains `lowStockAlerts`, `preorderReminders`, `draftCleanup` plus the 24 others |
| TST-102 | PRD-011 returns | Delivered order within 7 days | Buyer requests a return; seller approves; item received; refund | States follow `order_returns.status`; refund created once; window enforced (7 and 14 days) |
| TST-103 | ACL-003 | Two buyers A and B | A requests B's order, booking, dispute, return, conversation, document | 403 or 404 for every resource |
| TST-104 | ACL role matrix | One user per role | Call every guarded endpoint with every other role | All rejected with 401/403 |
| TST-105 | SECF-12 | Admin list endpoints | Send hostile sort/filter parameters | Rejected or safely ignored; no SQL errors |
| TST-106 | BR-024 | Paid order, 5 days elapsed | Run `escrowRelease` with and without open dispute | Release only without dispute |
| TST-107 | BR-032 | Provider mock fails twice then succeeds | Auto-refund | Attempts and final state correct |
| TST-108 | PRD-019 | EFD simulate provider | Complete order; force provider failure | Receipt stored; retry job re-submits; credit note on refund |
| TST-109 | NFR-001 | Test app | 601 requests in a window; 21 login attempts | 429 with the documented message |
| TST-110 | SECF-13 | `NODE_ENV` unset with production-like env | Start server | Refuses to start or refuses simulate providers |
| TST-111 | KNOWN-002 | CI | Compare route table to OpenAPI | Zero undocumented routes |
| TST-112 | NFR-005 | Two workers, one DB | Start two `worker.js` instances | Each job runs once per tick (advisory lock) |
| TST-113 | PRIV-003 | Account with orders | Soft delete then permanent delete | Documented fields removed; financial records retained per policy |
| TST-114 | E2E buyer | Staging, seeded seller | Search, add, checkout (simulate payment), track, confirm, review | Journey completes; order `delivered`; funds held then released |
| TST-115 | E2E seller | Staging | Register, verify, list, receive order, request withdrawal | Withdrawal `pending`; admin marks `paid` with reference |
| TST-116 | PERF | Staging with seeded data | Artillery ramp on `/products`, `/search`, checkout, webhook | p95 and error-rate thresholds agreed with owner |
| TST-117 | NFR-004 | Staging | Keyboard-only and screen-reader pass of buyer and seller journeys, both themes | No blockers |
| TST-118 | i18n | Both languages | Run `lint:i18n`; switch language on key flows | No untranslated literals; no missing keys |

## 4. Boot probe actually performed (TST-019)

Backend started with `NODE_ENV=development`, a throwaway MariaDB database containing all 160 migrations, `REDIS_DISABLED=true`, and fake local secrets. Results: `/health` 200; `/` 200; `/api/v1/store-types` 200 (1 seeded type); `/api/v1/categories` 200 (empty, fresh DB); `/api/v1/products` 200 (empty page, paginated shape); `/api/v1/status` 200; `/api/v1/me` 401; `/api/v1/admin/users` 401. Startup produced warnings about missing optional configuration (not enumerated). This was a smoke test, not functional coverage.

## 5. Traceability

Requirement-to-test mapping is in `product/requirements-traceability.md`. Test case IDs here (TST-nnn) are referenced there by file name; formal ID cross-references should be added when the proposed cases are implemented.

## 6. Entry and exit criteria (Proposed)

Entry for a release candidate: CI green on lint, unit, integration and DB suites, `npm audit` without high findings, migrations apply cleanly on the production engine version. Exit: e2e core journeys pass on staging; no open KNOWN items rated High; owner sign-off on business rules and legal items.
