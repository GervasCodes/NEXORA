# Business Rules and Process Documentation

> **Note 2026-11-11.** Snippe and MalipoPay were removed from the code. The live gateways are AzamPay, Selcom, PawaPay (mobile money and card) and PayPal; references below to the retired two describe the audited state or legacy rows only.

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Evidence | Numeric parameters are the **seeded defaults in `platform_settings` after applying all migrations** (Verified for a fresh database). Admins can change them at runtime, so production values are **Owner Confirmation Required**. State names come from live schema enums (Verified). Process descriptions marked "per existing doc" come from `docs/ESCROW_PAYMENT_FLOW.md` and related files and were **not re-executed end to end**. |

Rule IDs use the `BR-` prefix. "Confirm" = Owner Confirmation Required.

## 1. Pricing, commission and fees

| ID | Rule | Source | Confirm |
|---|---|---|---|
| BR-001 | Default platform commission is 10% of the seller's sale; the admin-settable ceiling is 30%. | `platform_settings.commission_rate`, `commission_rate_max` | Yes |
| BR-002 | A seller on a paid plan gets that plan's commission instead: Starter 8%, Growth 6%, Pro 4%; Free and Business Tools use the platform default. Commission is calculated per seller (a multi-vendor order can mix rates) and snapshotted on `order_items`/`booking_items`, so later plan changes never alter past sales. | `subscription_plans`, `docs/SUBSCRIPTIONS.md` | Yes |
| BR-003 | Commission, subscription and sponsorship charging are each behind a master switch that defaults to **off** (`monetization_commission_enabled`, `_subscriptions_enabled`, `_sponsorship_enabled`). A fourth switch for the verification fee was deleted when that fee was retired (migration 113). Switches are edited in `/admin/settings`; **scheduled** future flips (`monetization_schedule`) cannot be created or applied in this tree (KNOWN-003, KNOWN-021). | `platform_settings`; `docs/CHANGELOG.md`; `113_retire_verification_fee.sql` | **Yes (live state)** |
| BR-004 | Subscription plans can cap a seller's active listings (`max_active_listings`, NULL = unlimited). All seeded plans are unlimited. Creating a listing above the cap is rejected with 403. | `subscription.service`, `docs/SUBSCRIPTIONS.md` | Yes |
| BR-005 | Sponsorship is billed at 5,000 per day and featured-store placement at 8,000 per day (currency presumed TZS). | `sponsorship_daily_rate`, `featured_store_daily_rate` | Yes |
| BR-006 | A buyer-protection add-on fee is a fraction of the subtotal, bounded by a minimum and maximum constant in code. | `order.service.js` (`calculateBuyerProtectionFee`) | Yes (constants) |
| BR-007 | A cart holds at most 100 line items and at most 500 units per line. | `max_cart_line_items`, `max_quantity_per_cart_line` | No |

## 2. Delivery pricing

| ID | Rule | Source |
|---|---|---|
| BR-010 | Platform delivery fee is by distance band: up to 3 km 2,000; up to 7 km 4,000; up to 12 km 6,000; up to 20 km 9,000; then 600 per additional km. | `delivery_distance_bands` |
| BR-011 | Default rider fee is 3,000; default vehicle is `boda`; default region is Dar es Salaam; a 10-minute handling buffer applies to ETAs. | `rider_delivery_fee`, `default_delivery_vehicle`, `delivery_default_region`, `delivery_handling_buffer_minutes` |
| BR-012 | Fuel pass-through is 30% of fuel price movement, a single monthly change is capped at 15%, and a baseline cap of 4,057 is configured. A reminder job runs daily. | `fuel_passthrough_pct`, `fuel_max_monthly_change_pct`, `fuel_baseline_cap`, `fuelCapReminder.job.js` |
| BR-013 | An order is delivered by the platform (`delivery_mode = platform`) or by the seller (`own`). Delivery handover is confirmed by a code or by photo plus GPS. | `orders.delivery_mode`, `deliveries.handover_method` |

## 3. Order and payment lifecycle

States (Verified from schema):

- `orders.status`: pending, processing, shipped, delivered, cancelled
- `orders.payment_status`: unpaid, deposit_paid, paid
- `payments.status`: pending, completed, failed, chargeback
- `deliveries.status`: assigned, picked_up, in_transit, delivered, failed
- `orders.payment_method`: mobile_money, cash_on_delivery, snippe, malipopay_card, paypal, wallet
- `orders.order_type`: standard, pre_order (payments can be `full`, `deposit` or `balance`)

| ID | Rule | Source |
|---|---|---|
| BR-020 | A multi-vendor cart becomes one buyer-facing parent order plus one child order per seller; each child has its own status and delivery. | `order.service.js#checkout` |
| BR-021 | Checkout requires accepting terms; the acceptance timestamp and version are set server-side and stored on the parent order. | `orders.checkout_terms_accepted_at` (per `legal and customers trust .md`; migration 110 not individually re-read) |
| BR-022 | Order payment is confirmed only by a provider **webhook**, which sets the payment `completed` and the order `paid`. Webhooks are verified by signature or shared secret and protected from replay (`webhook_replay_guard`). | `docs/ESCROW_PAYMENT_FLOW.md`, `WEBHOOK_VALIDATION.md`; code in `app.js`, `webhookAuth.middleware.js` |
| BR-023 | After payment, the seller's net amount (after commission) is credited to `seller_wallets.held_balance`, not the withdrawable `balance`. | per existing doc; columns verified |
| BR-024 | An hourly job moves held funds to `balance` only when the order is delivered, `escrow_hold_days` (default 5) have elapsed, and no dispute is open on the item. | `escrowRelease.job.js` (scheduled `15 * * * *`); per existing doc |
| BR-025 | **Cash on delivery** orders skip escrow: after buyer-confirmed receipt, the seller's balance is credited directly and only the platform commission is debited (the balance may go negative and is repaid from later credits). | per existing doc; `wallet_transactions.reference_type = cod_commission` |
| BR-026 | COD orders unconfirmed by the buyer are auto-confirmed after 48 hours; a buyer is blocked from COD after 3 refused deliveries. | `cod_auto_confirm_hours`, `cod_block_after_refused_count` |
| BR-027 | Bookings follow the same escrow model but are always held (no COD path). | per existing doc |
| BR-028 | Stale unpaid orders are swept every 15 minutes; booking expiry runs every 15 minutes. | `staleOrders.job.js`, `bookingExpiry.job.js` (exact timeouts not re-read; confirm) |

## 4. Returns, refunds and disputes

| ID | Rule | Source |
|---|---|---|
| BR-030 | Return window is 7 days after delivery, 14 days for insured purchases. Return states: requested, approved, rejected, shipped_back, received, refunded, cancelled. | `return_window_days`, `return_window_insured_days`, `order_returns.status` |
| BR-031 | A seller has 72 hours to respond to a dispute; an SLA job runs every 15 minutes. Dispute states: open, under_review, resolved, rejected, withdrawn. | `dispute_seller_response_hours`, `disputeSla.job.js` |
| BR-032 | A refund is attempted automatically via the original provider where possible, with retries; otherwise it is flagged `manual_required` for an admin to complete outside the app. Refund states: pending, processing, completed, failed, manual_required. One refund row per dispute is enforced. | `refunds.status`, `refund.autoRefundForDispute.db.test.js` (6 tests pass) |
| BR-033 | An open dispute blocks release of held funds for that item (BR-024) and counts toward withdrawal blocking (BR-043). | per existing doc; `withdrawal_open_dispute_block_threshold` |
| BR-034 | Whether manual refunds and the loyalty-points treatment on refund are acceptable policy. | Owner decision (`legal and customers trust .md` items 4 and 6) |

## 5. Wallets, withdrawals and top-ups

| ID | Rule | Source |
|---|---|---|
| BR-040 | Seller withdrawals are between 5,000 and 5,000,000 per request. | `withdrawal_min_amount`, `withdrawal_max_amount` |
| BR-041 | Daily withdrawal cap depends on verification: none 200,000; ID-verified 2,000,000; business-verified 10,000,000. | `withdrawal_daily_cap_*` |
| BR-042 | New payout details are held 24 hours before the first payout to them. | `withdrawal_new_payout_hold_hours`, `withdrawal_requests.hold_until` |
| BR-043 | A withdrawal is refused when the seller has 3 or more open disputes. | `withdrawal_open_dispute_block_threshold` |
| BR-044 | Withdrawal states: pending, approved, rejected, paid. Payout is a **manual admin action** and requires a payout reference to mark paid; the platform does not call a payout API. Payout currency TZS or USD. | `withdrawal_requests`, `ESCROW_LICENSING_REVIEW.md`, `wallet.requestWithdrawal.db.test.js` (12 tests pass) |
| BR-045 | Buyer wallet top-ups are limited to 1,000 to 3,000,000 per top-up, with daily caps by KYC tier: tier0 500,000; tier1 2,000,000; tier2 10,000,000. | `topup_*` settings |
| BR-046 | Wallet balances are changed only through an append-only ledger (`wallet_transactions`, `buyer_wallet_transactions`); a nightly reconciliation job raises `wallet_reconciliation_flags`. | schema; `walletReconciliation.job.js` (scheduled `20 3 * * *`) |

## 6. Verification and trust

| ID | Rule | Source |
|---|---|---|
| BR-049 | The Verified Seller badge is free and follows account approval alone; the former one-time verification fee was retired (existing payers keep the badge). A separate "Verified Business" tier did not exist when migration 113 was written; the schema now has `users.verification_tier = business_verified` and `business_verification_requests`. | `113_retire_verification_fee.sql`, `business_verification_requests` | Yes |
| BR-050 | Sellers and delivery agents are subject to account verification (`not_required`, `pending`, `approved`, `rejected`); product and service providers must be approved before listing or operating (`requireApprovedSeller`, `requireApprovedDeliveryAgent`). | `users.account_verification_status`, middleware |
| BR-051 | Verification tiers: none, id_verified, business_verified; KYC tiers tier0 to tier2 for buyers. | `users.verification_tier`, `users.kyc_tier` |
| BR-052 | Approved verification documents are retained for `approved_document_retention_days` (default 0 = no retention); a daily job enforces it. | setting; `documentRetention.job.js` |
| BR-053 | Usernames cannot use reserved words (e.g. staff, official, verified, payments). | `username_blocklist` |
| BR-054 | Buyer KYC tier limits per order: tier0 ("Light signup") max order 500,000, max COD order 200,000, max 3 unpaid COD orders; tier1 ("ID verified") max order 5,000,000, COD cap falls back to the order cap, 5 unpaid COD orders; tier2 ("Enhanced verification") no order cap, 8 unpaid COD orders. | table `kyc_tier_limits` (seeded values); `kyc.service.js` |

## 7. Group buying, preorders and live selling

| ID | Rule | Source |
|---|---|---|
| BR-060 | Group buys have states open, successful, failed, cancelled and an expiry job every 15 minutes. Participation and pricing thresholds: not re-read. | `group_buys.status`, `groupBuyExpiry.job.js` |
| BR-061 | Pre-orders support a deposit and balance payment and fulfilment states (`awaiting_ready`, `ready`); hourly reminders run. | `orders.fulfilment_state`, `payments.payment_leg`, `preorderReminders.job.js` (see KNOWN-003: this job is not scheduled) |

## 8. Seller stock and POS tools

| ID | Rule | Source |
|---|---|---|
| BR-070 | Default reorder level is 5; back-dating of stock entries is limited to 7 days; offline sales sync limit 30 days; export grace 30 days. | `stock_*` settings |
| BR-071 | Published product stock changes only through the stock ledger (locked, relative, logged). | comment in `product.repository.js` |
| BR-072 | Low-stock alerts are meant to run hourly and notify by push. | `lowStockAlerts.job.js` (see KNOWN-003: not scheduled) |

## 9. AI assistant limits

| ID | Rule | Source |
|---|---|---|
| BR-080 | AI features are advisory and gated by an admin master switch (`ai_enabled`); token caps: 20,000 per user per day, 300,000 per user per month, 2,000,000 global per day, 30,000,000 global per month. | `ai_*` settings, `docs/openapi.yaml` ai tag |

## 10. Rules needing owner confirmation (summary)

BR-001, BR-003 to BR-006 (what is live and at what rates), BR-024 and `escrow_hold_days`, BR-032 and BR-034 (manual refunds), BR-041 and BR-045 (caps), BR-044 (manual payouts and licensing), all legal-document commitments.
