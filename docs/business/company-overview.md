# Company and Business Overview

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Evidence base | The delivered repository only (code, seed data, product copy, existing `docs/`). No owner interview, no external registry check, no production access. |
| Labels | **Verified** = observed in the repository. **Inferred** = reasonable reading of evidence. **Owner Confirmation Required** = cannot be known from the repository. |

## 1. Identity

| Item | Finding | Status | Source |
|---|---|---|---|
| Product / brand name | NEXORA | Verified | UI copy `frontend/src/i18n/en.js` (`marketing.about.*`), footer |
| Operating entity named in the product | "NEXORA MARKETPLACE", with BRELA registration number, TIN, registered address, support email and phone entered | Verified (present); **correctness Owner Confirmation Required** (not checked against BRELA/TRA; identifiers intentionally not repeated here) | `frontend/src/legal/company-information.md` |
| Relationship between brand and entity | Brand and entity share the name; no parent company, subsidiaries or other products appear | Inferred | repository-wide search |
| Public social handles | Instagram, Facebook, TikTok, YouTube links are hard-coded in the footer. A code comment calls similar links placeholders, but the values look like real accounts. | Verified (present); ownership Owner Confirmation Required | `frontend/src/components/Footer.jsx` |
| Support contact | A single email and phone are hard-coded in `Marketing.jsx` (not read from settings). The email is a consumer mail address rather than a company domain. | Verified | `frontend/src/pages/Marketing.jsx:11-12` |
| Web presence | Domain `nexoramarketplace.online` (API on `api.`, site on `www.`) is hard-coded in the frontend, backend cookie/SEO/email code and `docs/FRONTEND_CSP.md` | Verified (references); registration and DNS Owner Confirmation Required | `frontend/src/api/client.js`, `backend/src/app.js` |
| Mission, vision, values | None documented in the repository | Not verified | n/a |

## 2. What the business does

| Item | Finding | Status |
|---|---|---|
| Category | Online multi-vendor marketplace for **physical products and bookable services**, with platform-managed delivery | Verified (`marketing.about.*`; product, service, booking and delivery modules) |
| Tagline in product | "Shop local. Sell local. Delivered to your door." | Verified (`home.heroTitle`) |
| Value proposition to buyers | Protected payments and tracked delivery | Verified as stated copy; mechanism exists in code (escrow-style held balance, delivery tracking) but live operation not verified |
| Value proposition to sellers | Storefront, Verified Seller badge, growth tools (promotion, subscriptions, stock/POS tools, AI drafting) | Verified in code |
| Marketplace, not merchant | Terms state NEXORA is a marketplace and sellers are independent | Verified (`company-information.md`) |
| Problem solved | Trust and logistics gaps in local online commerce (payment protection, tracked last-mile delivery) | Inferred from features and copy; not stated as such by the owner |

## 3. Market and users

| Item | Finding | Status |
|---|---|---|
| Geography | Tanzania. Evidence: default currency TZS, delivery default region "Dar es Salaam", local mobile-money rails (M-Pesa, Mixx, Airtel Money, HaloPesa logos in footer), TRA tax-receipt integration, Swahili and English UI. | Verified (code); intended expansion Owner Confirmation Required (`ESCROW_LICENSING_REVIEW.md` notes no multi-country config exists) |
| User roles | Buyer, Seller (product, service or hybrid merchants), Delivery agent (individual or delivery business), Admin (admin and super_admin) | Verified (`users.role`, `users.admin_level`, `seller_profiles.merchant_type`) |
| Customer segments, size, market share | Not in the repository | Not verified |
| Competitors, positioning | Not in the repository | Not verified |

## 4. Business model

The code supports several revenue mechanisms. In a freshly migrated database, **all monetization switches are off**.

| Mechanism | Evidence | Fresh-DB default | Status |
|---|---|---|---|
| Sales commission | `platform_settings.commission_rate` = 10 (max 30); per-seller override via subscription plan | `monetization_commission_enabled = false` | Built; whether live Owner Confirmation Required |
| Seller subscription tiers | `subscription_plans`: Free, Starter 15,000 (8% commission), Growth 35,000 (6%), Pro 75,000 (4%), Business Tools 10,000 | `monetization_subscriptions_enabled = false` | Built; currency presumed TZS (Inferred) |
| Paid sponsorship and featured store | `sponsorship_daily_rate` 5,000; `featured_store_daily_rate` 8,000 | `monetization_sponsorship_enabled = false` | Built; whether live Owner Confirmation Required |
| ~~Seller verification fee~~ | **Retired** by migration 113: the Verified Seller badge is free and follows account approval. Legacy columns and the `seller_verification_fee` payment purpose remain for history; `VerificationFeeGate.jsx` is unused. | n/a | Verified (`113_retire_verification_fee.sql`) |
| Delivery fees | Distance bands (2,000 to 9,000 plus 600 per km beyond 20 km), rider fee 3,000, fuel pass-through | Seeded | Built |
| Affiliate and loyalty programs | `affiliate_*`, `referrals`, `loyalty_points_ledger` tables and pages | n/a | Built; terms Owner Confirmation Required |
| Pricing, take rate or revenue actually earned | Not in the repository | n/a | Not verified |

## 5. Business stage

**Inferred: pre-launch or early pilot.** The codebase is mature (160 migrations, 2,000+ passing tests, rich admin tooling), but the deployment guide has a "Before accepting real payments" section, the legal documents carry template notices pending legal review, and a root-level note lists "supply real business details" as the launch blocker. Actual launch status, user counts and revenue: **Owner Confirmation Required**.

## 6. Regulatory and operational dependencies

| Topic | Finding | Status |
|---|---|---|
| Holding customer money | The platform credits sellers to a `held_balance` in its own database and pays out manually on admin approval. The repository's own review (`docs/ESCROW_LICENSING_REVIEW.md`) says this needs evaluation by a licensed Tanzanian advocate and the payment providers. | Verified (design); regulatory conclusion Owner Confirmation Required |
| Tax receipts | TRA VFD/EFD integration with a simulate mode (`backend/src/modules/efd`, `docs/EFD_COMPLIANCE_NOTE.md`) | Verified (code); operating status not verified |
| Legal documents | Terms, Privacy, Refund, Cookie, Vendor Agreement, Delivery Liability, Insurance, Company Information exist as app content with template notices; legal review pending | Verified |
| Provider agreements | Selcom, AzamPay, Snippe, MalipoPay, PayPal, Brevo, Meta WhatsApp, SMS gateway, Cloudinary. Contracts and credentials are outside the repository. | Owner Confirmation Required |

## 7. Marketing claims vs operational reality

| Claim in copy | Reality in repository |
|---|---|
| "Protected payments" | Held-balance escrow and dispute handling are implemented; refunds to some payment methods are completed **manually** by an admin outside the app (stated in the refund policy draft and `refunds.status = manual_required`). |
| "Tracked delivery" | Delivery statuses, agent location sockets, OSRM routing with fallback are implemented; real-world coverage unknown. |
| "Verified Seller badge" | Business/ID verification workflows and tiers exist; review capacity and criteria Owner Confirmation Required. |

## 8. Owner questions (consolidated in `docs/README.md`)

BUS-Q1 legal name/registration correctness; BUS-Q2 which monetization switches are live; BUS-Q3 production launch status and volumes; BUS-Q4 target countries beyond Tanzania; BUS-Q5 company mission and positioning text; BUS-Q6 company-domain support mailbox and phone; BUS-Q7 legal opinion on held balances.
