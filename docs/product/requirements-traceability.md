# Requirements Traceability Matrix

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Legend - Implementation | **Impl** = code present; **Impl*** = present with a verified defect or gap; **Retired** = intentionally removed |
| Legend - Test status | **Pass** = test executed by this audit and passed; **Fail** = executed and failed (cause in `delivery/known-issues.md`); **None** = no test located by file-name/reference search (heuristic); **N/E** = test exists but not executed by this audit (e.g. Playwright e2e) |
| Priority | Proposed by this audit (M/S/C) |

Test references are repository-relative under `backend/tests/` (BE) or `frontend/tests/` (FE). Counts are from the 2026-10-29 runs: BE unit 118 suites/1,632 tests Pass; BE integration 11/96 Pass; BE db-integration 11 files (see below); FE 82/83 files, 476/477 tests.

| Req | Source | Pri | Impl | Key components | Acceptance criteria (ref) | Test cases | Test status |
|---|---|---|---|---|---|---|---|
| PRD-001 / FR-001 | `auth.validator.js` | M | Impl | `modules/auth`; FE `Register.jsx` | US-001 | BE integration `auth.login.test.js` (register validation); db `auth.register.db.test.js`; FE `pages/Register.test.jsx` | Pass |
| PRD-002 / FR-002 | `login.service.js` | M | Impl | `modules/auth`, `modules/otp`; FE `Login.jsx` | US-001 | unit `auth/login.service.test.js`; integration `auth.login.test.js`; db `auth.login.db.test.js` | Pass |
| FR-003 | `loginLockout.service.js` | M | Impl | same | US-002 | unit `auth/loginLockout.service.test.js`, `login.service.lockout.test.js`; integration `auth.lockout.test.js` | Pass |
| FR-004/005 SEC-001, SEC-002 | `auth.middleware.js`, `csrf.middleware.js` | M | Impl | middleware | - | integration `auth.sessionCookie.test.js`; unit `middleware/` | Pass |
| PRD-002 Google | `auth.routes.js` `/auth/google` | S | Impl | `modules/auth` | - | none located | None |
| PRD-003 / FR-010 | `search`, `product` | M | Impl | `modules/search`, `modules/product` | - | unit `product/`; `search` none | Partial |
| PRD-004 / FR-012 | `productMedia.controller` | M | Impl | `modules/product`; FE wizard | - | FE `pages/SellerProductWizard.test.jsx`; unit `product/productAudioRemoved.test.js` | Pass |
| PRD-005 / FR-020-022 | `order.service.js` | M | Impl | `modules/cart`, `modules/order`; FE `Cart.jsx`, `Checkout.jsx` | US-003 | unit `order/*`, `cart/`; FE `pages/Cart.test.jsx`, `Checkout.test.jsx`; db `orders.checkout.db.test.js`, `concurrency.db.test.js`; e2e `checkout.spec.js` | Unit/FE Pass; db **Fail** (4 tests, fixture drift, KNOWN-005); e2e N/E |
| PRD-006 / FR-030-032 SEC-006 | `payment.service.js`, `app.js` webhooks | M | Impl | `modules/payment`, providers | US-004 | unit `payment/*` (9 files); integration `payment.webhooks.test.js`, `payment.webhooks.resilience.test.js`; unit `webhookAuth.*` | Pass |
| PRD-007 / FR-033-034 | `wallet.service.js`, `escrowRelease.job.js` | M | Impl | `modules/wallet` | US-005, US-006 | unit `wallet/*`; db `wallet.creditSellersForOrder` (5), `wallet.codCommission` (4), `wallet.requestWithdrawal` (12) | Pass (db passes only after cleaning `stock_*` between files) |
| PRD-008 / FR-040-043 | `delivery.service.js` | M | Impl | `modules/delivery`, `queues/dispatchQueue.js`, `socket/` | US-009 | unit `delivery/*`, `routing/`; integration `socket.auth.test.js`, `socket.presence.test.js`; FE `OrderTrackingPage.test.jsx` | Pass |
| PRD-009 / FR-050-052 | `booking`, `service`, `availability` | S | Impl | modules | US-008 | db `booking.repository.db.test.js` (7); FE `Bookings.test.jsx`, `BookingDetail.test.jsx` | Pass |
| PRD-010 / FR-070 | `chat`, `socket` | S | Impl | modules | - | db `chat.messaging.db.test.js` (7); unit `chat/`; FE `Messages.test.jsx`, `ConversationThread.test.jsx` | Pass |
| PRD-011 / FR-060,062 | `dispute`, `refund` | M | Impl | modules | US-007 | unit `dispute/`, `refund/`; db `refund.autoRefundForDispute.db.test.js` (6); FE `DisputeDetail.test.jsx`, `NewDispute.test.jsx` | Pass |
| PRD-011 / FR-061 returns | `return` module | M | Impl | `modules/return` | - | none located | **None** |
| PRD-012 / FR-063 | `review` | S | Impl | module | - | unit `review/` | Pass |
| PRD-012 Q&A | `productQuestion` | S | Impl | module | - | none located | None |
| PRD-013 / FR-008 | `accountVerification`, `kyc`, `documentAccess` | M | Impl | modules | - | unit `accountVerification/`, `documentAccess/` ; `kyc` none | Partial |
| PRD-014 / FR-064, 090 | `admin`, `audit`, `fraud`, `settings`, `maintenance`, `dataReset` | M | Impl | modules | US-010 | unit `admin/`, `audit/`, `fraud/`, `settings/`, `dataReset/`; db `admin.accountManagement.db.test.js` (10); `maintenance` none | Pass (maintenance: None) |
| PRD-015 / FR-080 | `subscription`, `sponsorship`, `featuredStore`, `monetizationSchedule` | C | Impl (switched off by default) | modules | - | unit `subscription/`, `sponsorship/`, `sponsorshipCredit/`, `featuredStore/`; `monetizationSchedule` none | Pass |
| PRD-016 / FR-081 | `stock`, `pos` | S | **Impl*** (low-stock job unscheduled) | modules, jobs | - | unit `stock/` (incl. `alertsJob.test.js` which checks the wrong file); FE `pages/stock`, `pages/seller` | Pass (but misleading, KNOWN-003) |
| PRD-017 / FR-082 | `groupBuy`, `liveSelling`, `affiliate`, `referral`, `rewardSettlement` | C | Impl | modules | - | unit `groupBuy/`, `affiliate/`, `referral/`, `rewardSettlement/`; `liveSelling` none | Partial |
| PRD-018 | `ai` | C | Impl | `modules/ai`, `ai/providers` | - | unit `ai/`; integration `ai.routes*.test.js` | Pass |
| PRD-019 | `efd` | S | Impl | `modules/efd` | - | none located | **None** |
| PRD-020 | `i18n` | M | Impl | `backend/src/i18n`, `frontend/src/i18n` | - | unit `i18n/` | Pass |
| PRD-021 | `status` | C | Impl | `modules/status`; FE `StatusPage.jsx` | - | unit `status/` | Pass |
| NFR-001 | `rateLimit.middleware.js` | M | Impl | middleware | 600/15 min; 20/15 min auth | boot probe only; no automated limit test located | Unverified |
| NFR-002/003 | `docs/SLA.md` | S | Stated only | `.github/workflows/uptime-check.yml` (absent from delivered tree) | - | none | **Unmeasured** |
| NFR-004 | `frontend/tests/a11y` | S | Impl* | FE | - | `keyPages.a11y.test.jsx` | **Fail** (HomeCarousel, 1 test) |
| NFR-005 | `worker.js`, `dbLock.js`, `dispatchQueue.js` | S | Impl | backend | - | `backend/loadtest/nexora-load-test.yml` (artillery) | N/E |
| NFR-007 browser support | - | S | **Not defined** | - | - | - | - |
| SEC-008 uploads | `fileContentValidation.middleware.js`, `malwareScan.js` | M | Impl | middleware, utils | - | unit `fileContentValidation.middleware.test.js`, `utils/fileContentValidator.test.js` | Pass |
| SEC-004 passwords | `hashPassword.js` (bcrypt cost 10) | M | Impl | utils | - | indirectly via auth tests | Pass |
| SEC-005 role guards | `authorize.middleware.js` | M | Impl | middleware | - | unit `middleware/` | Pass |
| SEC-011 audit log | `audit` | M | Impl | module | - | unit `audit/` | Pass |
| SEC-012 phone encryption | `phoneEncryption.js` | M | Impl* (key derived from `JWT_SECRET`) | utils | - | none located | None |

## Coverage observations

- Modules with **no test referencing them** (heuristic file-name/reference search): `businessTools`, `buyerAddress`, `content`, `deliveryBusiness`, `efd`, `liveSelling`, `maintenance`, `monetizationSchedule`, `pickupPoint`, `productQuestion`, `return`, `search`, `sellerSavedFilter`, `serviceCategory`, `storeType`, `support`, `wishlist` (17 of 72).
- 101 of 139 frontend pages are not named in any frontend test file. Frontend e2e covers three journeys (`checkout`, `home`, `product-detail`) and was not executed (no browser downloads in the sandbox).
- The test files exist for 55 of 72 backend modules, but per-module counts from the same heuristic are not reliable and are not given.
