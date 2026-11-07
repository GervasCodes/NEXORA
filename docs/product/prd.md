# Product Requirements Document (PRD) - NEXORA

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Nature | **Reverse-engineered** from an existing application. Requirements describe what the product does today (Verified) and, separately, what is proposed. No owner-authored product brief was provided. |
| Status labels | Verified / Inferred / Proposed / Owner Confirmation Required |

## 1. Vision and objectives

| ID | Statement | Status |
|---|---|---|
| BUS-001 | NEXORA is a regional multi-vendor marketplace that connects buyers, product sellers, service providers and delivery agents in one platform. | Verified (`docs/SRS.md`, `marketing.about.*`) |
| BUS-002 | Build buyer trust through payment protection, tracked delivery, verified sellers, reviews and dispute resolution. | Verified (features exist); effectiveness not measured |
| BUS-003 | Give sellers a storefront plus tools to grow (promotion, subscriptions, stock/POS, AI drafting, group buys, live selling, affiliates). | Verified in code |
| BUS-004 | Operate first in Tanzania with local payment rails, TZS, English and Swahili. | Verified (code) |
| BUS-005 | Generate platform revenue via commission, subscriptions, sponsorship and fees. | Built, **disabled by default**; live status Owner Confirmation Required |

## 2. Problem statement and value proposition

**Inferred** (the owner has not stated it): local online commerce suffers from payment risk, unreliable last-mile delivery and low seller credibility. NEXORA offers (a) held-payment protection with dispute handling, (b) platform-managed delivery with tracking, (c) seller verification badges, (d) tools that let small sellers operate online.

## 3. Personas (Inferred from roles and flows)

| Persona | Role value | Main goals | Key screens |
|---|---|---|---|
| Buyer ("Amina") | `buyer` | Find products/services nearby, pay safely, follow delivery, resolve problems | `/`, `/products`, `/checkout`, `/orders/:id/tracking`, `/disputes` |
| Product seller | `seller`, `merchant_type=product` | List products, fulfil orders, get paid, grow | `/seller/*`, `/seller/stock`, `/seller/pos` |
| Service provider | `seller`, `merchant_type=service` or `hybrid` | Publish services, manage availability and bookings | `/seller/services`, `/seller/availability`, `/seller/bookings` |
| Business-tools seller | `seller_mode=business_tools` | Use stock/POS tools without marketplace listing | `/business-tools`, `/business` |
| Delivery agent / delivery business | `delivery_agent` | Receive and complete delivery offers, track earnings | `/delivery/*` |
| Platform admin | `admin` | Moderate users, verify sellers, handle disputes/refunds/payouts, configure platform | `/admin/*` |
| Super admin | `admin_level=super_admin` | Manage admins; destructive operations (data reset) | `/admin/admins`, `/admin/data-reset` |

Persona demographics, volumes and research: **Not verified**.

## 4. Scope

**In scope (Verified as implemented in code):** accounts and verification; catalog and search; services and bookings; cart and checkout (multi-vendor); payments through Selcom, AzamPay, Snippe, MalipoPay (mobile and card), PayPal and wallet; seller wallets with held balance and manual withdrawals; delivery dispatch and tracking; chat; notifications (in-app, push, email, SMS, WhatsApp); reviews and Q&A; returns, refunds, disputes; admin console; seller subscriptions and promotion; stock and POS tools; group buys, live selling, affiliate and loyalty; AI assistant; TRA tax-receipt integration; public status page; SEO sitemaps.

**Out of scope / retired:** department sponsorship (retired as a product; code remnants remain), seller "loans" (frontend remnant only), product audio (removed; routes return 410), native mobile apps (the SRS puts them out of scope; `docs/MOBILE_STRATEGY.md` documents the chosen alternative, an installable PWA with service worker, offline fallback and push, which is Implemented).

**Assumptions:** users have internet access; third-party providers are available; production runs on Render (web, worker, static site) with Aiven MySQL and Redis (stated in `docs/DEPLOYMENT.md`, **not verified**).

## 5. Requirements

Statuses: **Implemented** = code present and either tests passed or boot probe verified; **Implemented, untested** = code present, no test located; **Partial/Defective** = see `delivery/known-issues.md`.
Priority is **Proposed** by this audit (M = must, S = should, C = could) because no owner prioritisation exists.

### 5.1 Functional

| ID | Requirement | Priority | Status |
|---|---|---|---|
| PRD-001 | Self-registration for buyer, seller, delivery agent; admin accounts are not self-registrable. | M | Implemented |
| PRD-002 | Email/password login is **always two-step** (password, then a one-time code emailed to the user; no session is issued until the code is verified), with progressive lockout; Google sign-in is a separate path that does not use the password+OTP flow. | M | Implemented (Google: untested) |
| PRD-003 | Browse, filter, search and view products, services, stores, departments. | M | Implemented (`search` module untested) |
| PRD-004 | Sellers create and manage products with photos/video via Cloudinary signed upload, variants and bulk price tiers. | M | Implemented |
| PRD-005 | Cart and checkout, single or multi-vendor, with terms consent. | M | Implemented (DB checkout tests fail on fixture drift, see KNOWN-005) |
| PRD-006 | Pay by mobile money, card, PayPal, wallet or cash on delivery; confirmation only via verified webhook. | M | Implemented |
| PRD-007 | Seller earnings held until delivery + hold period + no dispute; withdrawals approved and paid manually. | M | Implemented; regulatory review Owner Confirmation Required |
| PRD-008 | Platform delivery: dispatch offers to agents, live tracking, ETA, handover by code or photo+GPS. | M | Implemented |
| PRD-009 | Services: availability calendar, pricing rules, bookings with confirm/reject/cancel. | S | Implemented |
| PRD-010 | Buyer-seller chat with attachments and realtime presence. | S | Implemented |
| PRD-011 | Returns, refunds (auto where possible, else manual), disputes with SLA. | M | Implemented (`return` module untested) |
| PRD-012 | Reviews with photos and seller reply; product Q&A. | S | Implemented (Q&A untested) |
| PRD-013 | Seller and delivery-agent verification (ID/business) with tiered limits. | M | Implemented |
| PRD-014 | Admin console: users, sellers, content, settings, maintenance mode, fraud, audit logs, broadcasts. | M | Implemented |
| PRD-015 | Seller subscriptions, sponsorship, featured store (master-switched). | C | Implemented, disabled by default |
| PRD-016 | Seller stock, sales, purchases and POS with offline sync. | S | Implemented; low-stock alert job not scheduled (KNOWN-003) |
| PRD-017 | Group buys, live selling, affiliate and loyalty. | C | Implemented (live selling untested) |
| PRD-018 | AI buyer assistant, seller drafting and admin copilot, spend-capped and switchable. | C | Implemented |
| PRD-019 | TRA VFD/EFD tax receipts with simulate provider and retry job. | S | Implemented, untested; operational use Owner Confirmation Required |
| PRD-020 | English and Swahili UI and server messages. | M | Implemented |
| PRD-021 | Public status page and SLA targets. | C | Implemented; targets not instrumented |

### 5.2 Non-functional (see `technical/technical-requirements.md` for detail)

| ID | Requirement | Status |
|---|---|---|
| NFR-001 | API abuse control: 600 requests / 15 min / IP; auth endpoints 20 / 15 min. | Implemented (Verified in code) |
| NFR-002 | Availability target 99.5% monthly. | Stated target; monitoring workflow absent from delivered tree |
| NFR-003 | Payment webhook processing under 30 seconds. | Stated target; not measured |
| NFR-004 | Accessibility: automated axe checks on key pages. | Partial (1 failing test) |
| NFR-005 | Horizontal scalability: separate worker process, advisory locks, durable queue (needs Redis). | Implemented; not load-tested here |
| NFR-006 | Observability: structured logs (pino), Sentry, health and status endpoints. | Implemented |
| NFR-007 | Browser support matrix. | **Not defined** |

### 5.3 Security (see `technical/security-privacy.md`)

Security requirement IDs are defined in `technical/security-privacy.md`: SEC-001 sessions, SEC-002 CSRF, SEC-003 login hardening (mandatory OTP, lockout), SEC-004 bcrypt passwords, SEC-005 role and approval guards, SEC-006 webhook verification and replay guard, SEC-007 input validation, SEC-008 upload safety, SEC-009 API security headers, SEC-010 abuse limits, SEC-011 audit trail, SEC-012 payer-phone encryption, SEC-013 fraud and reconciliation, SEC-014 data-reset guard, SEC-015 secrets handling, SEC-016 observability. All Implemented; weaknesses are recorded in the security document.

## 6. User stories and acceptance criteria (key journeys)

| ID | Story | Acceptance criteria (testable) |
|---|---|---|
| US-001 | As a visitor I register as a buyer. | Registration fails with 400 unless first/last name, valid email, password of 8+ characters, accepted terms and a valid role are supplied; success creates the account (`auth.register.db.test.js`). |
| US-002 | As a user I am protected from password guessing. | After 5 consecutive failed logins the account returns 429 `ACCOUNT_LOCKED` for 5 min, then 15, then 60 on further tiers (`auth.lockout.test.js`). |
| US-003 | As a buyer I check out a multi-vendor cart. | One parent order and one child order per seller are created, stock decrements once, the cart empties; insufficient stock rolls back everything (`orders.checkout.db.test.js`; currently failing on fixtures, see KNOWN-005). |
| US-004 | As a buyer I pay by mobile money. | Order becomes `paid` only after a verified webhook; a replayed webhook does nothing (`payment.webhooks.test.js`, `webhookReplayGuard.test.js`). |
| US-005 | As a seller I am paid safely. | Funds appear in `held_balance`, move to `balance` only after delivery + 5 days + no open dispute; credit is idempotent (`wallet.creditSellersForOrder.db.test.js`). |
| US-006 | As a seller I withdraw earnings. | Request rejected below 5,000, above 5,000,000, above the tier daily cap, above balance, or with 3+ open disputes; a first-time payout destination is held 24 h (`wallet.requestWithdrawal.db.test.js`). |
| US-007 | As a buyer I open a dispute and get a refund. | Refund row is unique per dispute, auto-attempted with retries, else `manual_required` (`refund.autoRefundForDispute.db.test.js`). |
| US-008 | As a customer I book a service. | Booking decrements availability for every date and rolls back entirely if any date is closed, missing or full (`booking.repository.db.test.js`). |
| US-009 | As an agent I accept a delivery offer. | Offers expire through a durable queue when Redis is configured; otherwise a non-durable in-process timer is used (boot log warning). |
| US-010 | As an admin I suspend an account. | Suspended users receive 403 `ACCOUNT_SUSPENDED` on any authenticated call (`auth.middleware.js`, `admin.accountManagement.db.test.js`). |

## 7. Success metrics

Verified existing instrumentation: admin dashboard shows GMV, take rate, retention and DAU/WAU/MAU (`docs/ACTIVE_USERS_METRIC.md`); web-vitals and zero-result searches are recorded. **No target values exist.** Proposed (Owner Confirmation Required): GMV, completed-order rate, payment success rate, time-to-first-delivery, dispute rate, seller activation, withdrawal turnaround.

## 8. Dependencies

Payment providers (Selcom, AzamPay, Snippe, MalipoPay, PayPal); Cloudinary; Brevo email; Meta WhatsApp Cloud API; SMS gateway; OSRM routing; TRA VFD; Redis/BullMQ; Sentry; AI providers (Anthropic, OpenAI, Gemini, Groq, OpenRouter); MySQL/MariaDB.

## 9. Current vs planned

`docs/RECOMMENDATIONS.md` (rules-based recommendations), `docs/MOBILE_STRATEGY.md` (PWA) and `docs/MULTICURRENCY_PAYOUTS.md` (TZS/USD payouts; `withdrawal_requests.payout_currency`) describe work that is **already implemented**, so they are current capabilities, not roadmap. `docs/SCALABILITY_REPORT.md` contains forward-looking recommendations that were not re-evaluated here. Proposed work from this audit is in `delivery/implementation-plan.md`.
