# NEXORA New Features Roadmap — Progress

Running status sheet for the 10-phase new-features roadmap. Rewritten in full each phase so it always reflects current true state — this is not a per-phase changelog.

Legend: ✅ Done · 🟡 Partial · ⬜ Not started

---

## Phase Q1 — Trust & Buyer Protection ✅ Done

- ✅ **Buyer protection / return-shipping workflow** — New `order_returns` / `order_return_history` tables and a `return` module (repository/service/controller/routes) mirroring the disputes module's shape. State machine: `requested → approved → shipped_back → received → refunded`, plus `rejected`/`cancelled`. 7-day return window (14 days if the buyer bought the insurance add-on). Buyer requests, seller or admin approves/rejects, buyer ships back with a tracking number, seller/admin confirms receipt, which auto-triggers a refund and reverses the seller's wallet earnings for the returned amount.
- ✅ **Checkout buyer-protection insurance add-on** — Optional checkbox at checkout. Fee = 1.5% of cart subtotal, clamped between 1,000–20,000 TZS, added to the order total and charged with it. Purchasing it extends the return window from 7 to 14 days. Stored on `orders.buyer_protection_addon` / `buyer_protection_fee`.
- ✅ **Progressive KYC tiers** — `users.kyc_tier` (`tier0`/`tier1`/`tier2`), a `kyc_tier_limits` config table (tier0: 500,000 TZS, tier1: 5,000,000 TZS, tier2: unlimited), and a `kyc_upgrade_requests` queue (document upload → admin review → approve/reject), mirroring `accountVerification`'s shape. Enforced at checkout via `kycService.enforceOrderLimit()` against the final charge total (subtotal + insurance fee).

**Refactor note:** `refund` module (`refund.service.js`/`refund.repository.js`) was generalized to support a refund triggered by either a dispute or a return (previously dispute-only) — `refunds.dispute_id` is now nullable, with a new nullable+unique `refunds.return_id` and a CHECK constraint enforcing exactly one source. All existing retry/idempotency/provider logic is shared, not duplicated.

**Nothing descoped** in Q1 — all three features shipped as specified.

---

## Phase Q2 — Wallet & Seller Finance ✅ Done

- ✅ **General-purpose wallet top-up** — New `buyerWallet` module (`buyer_wallets`/`buyer_wallet_transactions`/`wallet_top_ups` tables, migration 084). Buyer initiates a top-up via mobile money (`POST /payments/wallet/topup`), same initiate-now/confirm-later flow as any other provider payment; on provider confirmation the balance is credited. `wallet` is now a selectable checkout payment method (`POST /payments/:orderId/wallet`) - synchronous, no gateway round trip, debits the balance and reuses the exact same downstream order-paid handling (seller crediting, notifications, status transition) as every other payment method. `refund.service.js` already routes a wallet-paid order's refund back into the buyer's wallet balance rather than a provider refund call.
- ✅ **Seller working-capital / microloan product** — New `loan` module. A verified seller can borrow up to 70% of their current `held_balance` (pending escrow), instantly, for a flat 5% fee, one active advance at a time. Repayment isn't a separate step the seller takes - `wallet.service.js`'s existing escrow-release path (`applyRepaymentOnRelease`) intercepts held-balance releases and applies them to the outstanding advance first, before anything reaches the seller's withdrawable balance.

**Licensing note:** added an addendum to `docs/ESCROW_LICENSING_REVIEW.md` flagging that a general-purpose stored-value wallet and a seller-lending product each raise their own regulatory questions beyond the marketplace-escrow ones already documented there, separate from the payment-provider integration itself (which reuses existing provider rails unchanged) - same "flag for legal review before real money" posture that doc already establishes, not a new concern this phase invented.

**Nothing descoped** in Q2 — both features shipped as specified.

---

## Phase Q3 — Communication Channels ✅ Done

- ✅ **WhatsApp Business API integration** — New `whatsapp` module wrapping Meta's Cloud API (`cloudApi.provider.js`, with a `simulate.provider.js` dev fallback, mirroring the existing mobile-money provider-router pattern exactly). Two halves:
  - *Order updates:* `notification.service.js` gained a `withWhatsApp` leg (opt-in only, via a new `users.whatsapp_order_updates` flag) alongside its existing email leg. Wired into the order-placed and order-status-changed notifications. Buyers can opt in/out from Account settings or by texting the bot.
  - *Catalog/storefront browsing:* a numbered-menu bot over the webhook (`whatsapp_sessions` holds just enough state to know what a bare "2" reply means) - browse categories → top products with storefront links, track an order by number (phone-matched against the order's shipping phone for identity), or reach support. Reuses the existing `category`/`product` repositories rather than a parallel catalog.
  - Inbound webhook verifies Meta's `X-Hub-Signature-256` HMAC over the raw request body (new `verifyWhatsAppWebhook` in `webhookAuth.middleware.js`, same shape as the existing Snippe/MalipoPay Card raw-body webhooks).
- ✅ **In-app support/helpdesk widget** — New `support` module (`support_tickets`/`support_messages`), deliberately separate from the existing buyer<->seller/delivery `chat` module, which has no admin participant at all. Any authenticated user can open a ticket via a site-wide floating widget; admins work the queue from a dedicated page. A WhatsApp "3 - talk to support" reply creates or appends to a ticket too (phone-matched, so repeated requests don't spawn duplicate tickets), whether or not the phone number belongs to a registered account.

**Nothing descoped** in Q3 — both features shipped as specified.

---

## Phase Q4 — Tax Compliance ✅ Done

- ✅ **EFD (Electronic Fiscal Device) e-invoicing integration** — New `efd` module wrapping TRA's VFD (Virtual Fiscal Device) service (`traVfd.provider.js`, with a `simulate.provider.js` dev fallback, mirroring the existing payment/WhatsApp provider-router pattern). Per-seller, not platform-wide: a seller registers their TIN (and VRN, if VAT-registered) via a new `seller/tax-info` page, an admin verifies it (`admin/efd` queue), and only then does a paid order attributed to that seller get a fiscal receipt (receipt number + verification code) submitted on their behalf and shown on the order page. An unregistered/unverified seller's orders are marked `not_applicable`, not treated as an error - they simply keep getting NEXORA's existing non-fiscal payment receipt. Hooked into `payment.service.js`'s existing order-paid webhook handler, per (single-vendor) order, right alongside the seller wallet-crediting call it already makes there.

**Compliance note:** added `docs/EFD_COMPLIANCE_NOTE.md`, mirroring `docs/ESCROW_LICENSING_REVIEW.md`'s existing convention - flags that *which sellers are legally required to register*, *TIN/VRN format validity beyond a basic shape check*, *the real TRA VFD API contract* (no public self-serve sandbox exists to build against, so the provider's request/response shape is best-effort pending real credentials), and *NEXORA's own tax-facilitation obligations* are all still open questions for an actual Tanzanian tax advisor - not resolved by this code.

**Nothing descoped** in Q4 — shipped as specified.

---

## Phase Q5 — Logistics ✅ Done

- ✅ **Agent/kiosk pickup points** — New `pickupPoint` module: admin manages a network of physical pickup locations (`admin/pickup-points`). At checkout, a buyer can choose "pickup point" instead of home delivery; the server substitutes the pickup point's own address in for the order's delivery destination before the order/delivery rows are ever created, so the existing delivery-agent flow (assigned → picked_up → in_transit → delivered) needs no changes at all - only where "delivered" physically ends up changes. The buyer's final in-person collection is confirmed through the existing buyer-confirms-receipt flow, reused rather than duplicated with a new redemption-code system.

**Nothing descoped** in Q5 — shipped as specified.

---

## Phase Q6 — Performance & UX 🟡 Partial

- ✅ **Data-saver / low-bandwidth mode** — New `users.data_saver_enabled` preference (extends the existing language/theme/currency settings endpoint rather than a new one), a `DataSaverContext` mirroring `CurrencyContext`'s exact pattern (localStorage-backed, syncs from profile on load), and an `optimizeImageUrl()` helper that rewrites Cloudinary URLs to request a smaller/lower-quality variant (`q_auto:eco,w_480,f_auto`) with no re-upload needed. Applied to `ProductCard` and `ServiceCard` - deliberately the two highest-traffic image surfaces, not every image in the app (chat attachments, store logos, banners, etc. are unchanged). Toggle lives in Account settings.
- 🟡 **UI/UX polishing pass** — landed a bounded slice of this, not the full open-ended brief:
  - ✅ First-time onboarding walkthrough: a 4-step modal shown once per buyer account per browser (`OnboardingTour.jsx`), covering search/browse, checkout & pickup points, order tracking, and support.
  - ✅ Checkout simplification: added clear "Step 1 · Delivery / Step 2 · Payment / Step 3 · Review" section labels to the existing single-page checkout flow (not a multi-page wizard - the existing structure was sound, it just needed orientation).
  - 🟡 Empty/error states: `Returns.jsx` and `WalletPage.jsx` (the buyer-facing pages most likely to be someone's *first* empty state) were upgraded to the app's existing shared `EmptyState` component. The broader backlog - most seller and nearly all admin pages still hand-roll a plain "No X yet" `<p>` - was intentionally **not** touched this phase; converting dozens of pages for a cosmetic-only change felt like scope well beyond what "polish" should mean for one phase, versus doing a couple of genuinely representative examples properly.
  - ⬜ Navigation/search clarity: not started this phase.

**Descoped/deferred, explicitly:** a full site-wide empty-state sweep and navigation/search clarity work are left for a future pass - noted here rather than silently dropped.

---

## Phase Q7 — Growth & Discovery ✅ Done

- ✅ **Group buying** — new `groupBuy` module: a seller sets a discounted group price + minimum participant count + deadline on one of their products; buyers join for free (no pre-authorization/hold - see migration 089's comment on why). A new 15-minute cron sweep (`groupBuyExpiry.job.js`) resolves expired groups to `successful`/`failed` based on whether they hit the minimum. A successful group gives each participant a 48-hour window to claim their discounted order, which creates a real order directly (not through the cart, since a group buy is always exactly one product at a fixed price).
- ✅ **Short video product listings** — **already existed** in the codebase before this phase (`product_videos` table, fully wired backend-to-frontend including a seller upload UI). No new work needed here; noting it explicitly rather than claiming credit for pre-existing functionality.
- ✅ **Live selling** — scoped down, explicitly: new `liveSelling` module is a scheduling/announcement layer (a seller posts a session with a start time and a link to wherever they're actually streaming - Instagram/YouTube/TikTok Live, most realistically, for sellers this size), not real video-streaming infrastructure (RTMP ingest, playback, chat, etc.), which is a large separate infrastructure project outside a single roadmap phase's reasonable scope.
- ✅ **Referral & loyalty points program** — every user gets a `referral_code` at signup; registering with someone else's code links them, and the referrer gets a one-time 200-point bonus once the referred user completes their first paid order. Every completed order also earns the buyer points (1 per 1,000 TZS charged), redeemable at checkout as a discount (10 TZS/point) - both hooked into the existing payment-webhook fire-and-forget pattern, with redemption using a validate-then-commit split so a failed checkout never burns points that were never actually spent.
- ✅ **B2B / bulk ordering tier** — new `business` module: a buyer can apply for a business account (TIN + name, admin-verified) for wholesale catalog surfacing; separately, and NOT gated behind that verification, a seller can post bulk-quantity price tiers on a product (e.g. "12+, pay X each") that automatically apply to any buyer's cart at checkout, the same way a wholesale shelf tag isn't identity-checked.
- ✅ **Affiliate/influencer dashboard** — new `affiliate` module with SPA-friendly click tracking (a `?ref=CODE` landing page records a click via the API and stores a token client-side - no cookies/redirects), a 30-day attribution window, and commission (default 5%, admin-adjustable per affiliate) paid automatically into the affiliate's existing buyer wallet once an attributed order completes - reusing Phase Q2's wallet ledger rather than building a third money-holding system.
- ✅ **SEO content engine** — new `content` module: admin-authored buying guides (draft/published, unique slugs, optional category linking), public at `/guides` and `/guides/:slug`.

**Descoped/deferred, explicitly:** live-selling is a links-and-schedule layer, not streaming infrastructure (see above). Guide bodies render as plain paragraphs, not full markdown (tables, code blocks, etc.) - no markdown-rendering dependency exists in this project yet, and guide content doesn't currently need more than that.

---

## Phase Q8 — AI Extensions (advisory only, no auto-execute) ✅ Done

- ✅ **AI-assisted dispute triage** — **already existed** (`ai.service.js#suggestDisputeResolution`, wired into `DisputeDetail.jsx` via `NexoraDisputeCopilot`). Rule-based historical precedent (this seller's past resolutions for this exact dispute type) computed first, AI phrases a suggestion on top, `requiresReview: true` always - it pre-fills the existing resolve form, never calls `resolveDispute` itself. No new work needed; noting it explicitly rather than claiming credit for pre-existing functionality (same situation as short video listings in Q7).
- ✅ **AI demand forecasting for sellers** — genuinely new this phase. `seller.repository.js#getSalesVelocityByProduct` computes real per-product sales velocity (units sold in the trailing 30 days ÷ 30) and projects days-of-stock-remaining from current stock - plain arithmetic, not AI-invented. `ai.service.js#suggestRestockAndPricing` flags products projected to run out within 14 days ("restock soon") and well-stocked products with zero recent sales ("slow movers, consider a discount" - never a specific discount amount, since NEXORA doesn't have the seller's margin data). AI only phrases a plain-language note on top of those two rule-based lists. Surfaced on the seller analytics page via a new `NexoraDemandForecast` widget, alongside the existing AI analytics summary.
- ✅ **AI fraud-signal summarization for admins** — **already existed** (`ai.service.js#explainFraudQueue`, wired into `AdminFraud.jsx` via `NexoraFraudExplain`). Real open-flag counts/severity/rule breakdown computed first, AI phrases a plain-language triage note on top - never invents a fraud verdict.

**Nothing descoped** in Q8 - all three features are live. Two of three were already built before this phase; this phase's actual new work was the demand-forecasting feature end-to-end (repository query, service function, route, frontend widget).

---

## Phase Q9 — Admin Tools ✅ Done

- ✅ **Admin anomaly-detection dashboard (visualized fraud/abuse signals)** — new `GET /admin/fraud-dashboard` (`fraud.service.js#getDashboardStats`) aggregates the existing `fraud_flags` table (no new tables, no ML) into: a gap-filled 30-day daily trend, a per-rule breakdown of the last 7 days vs. each rule's own trailing baseline, the open queue's severity mix, 30-day confirmed/dismissed resolution rate, and the all-time most-flagged entities. "Anomaly" is a plain mean/stddev threshold over the platform's own history (a day or rule needs to clear both a statistical bar *and* an absolute-count floor to register as a spike, so a quiet baseline doesn't manufacture false positives) - same explainable-heuristics posture as the fraud rules themselves (`fraud.service.js`'s existing `evaluateOrder`/`evaluateWithdrawal`). New `AdminFraudDashboard.jsx` page (`/admin/fraud-dashboard`, linked from the sidebar next to "Fraud review") renders it with the existing `BarChart`/`LineChart` components - no new charting dependency. Those two shared components gained an optional `highlightLabel` prop (default `"projected"`, used unchanged by the existing demand-forecast/analytics callers) so this page's spike-highlighted points can say "spike" instead of the forecast-specific default. Deliberately kept separate from `AdminFraud.jsx`: that page is for working the open queue; this one is for spotting trends and pattern spikes over time.

**Nothing descoped** in Q9 — shipped as specified. No new AI-phrased layer was added on top (Q8 already covers AI summarization of the open queue via `NexoraFraudExplain`); this phase's brief was specifically the visualization/anomaly-detection layer.

## Phase Q10 — Native & Distribution ⬜ Not started
- ⬜ Native iOS/Android apps
- ⬜ Downloadable APK (direct install, outside Play Store)
