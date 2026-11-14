# Administrator Manual

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Basis | Admin routes in `App.jsx`, backend admin routes and services, `platform_settings` seed values, database enums, existing docs. **Admin screens were not viewed**; procedures are given by page address and rule. Seeded defaults may differ from production. |
| Safety | Money and data-deletion actions are irreversible in practice. Use a second person to check payouts and keep notes in the admin note fields. |

## 1. Access and roles

- Admin pages live under `/admin` and require an `admin` account. A **super admin** (`admin_level = super_admin`) can also manage admins and run data reset.
- The first admin is created by `npm run db:seed` using `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PHONE`. **Change that password at first login** and remove it from the environment afterwards.
- Sign-in is two-step (password, then emailed code). Use a mailbox you control. Sessions last 7 days: sign out on shared computers.
- Admins have broad powers; there are no per-feature admin permissions, only the two levels. Admin changes are audit-logged.

## 2. Page map

| Page | Purpose |
|---|---|
| `/admin` | Dashboard: GMV, take rate, retention, active users |
| `/admin/dispatch`, `/admin/users/map` | Live delivery dispatch and user map |
| `/admin/users`, `/admin/deleted-accounts` | Search, view, suspend or reactivate accounts; review deleted accounts |
| `/admin/sellers`, `/admin/delivery-agents` | Approve and manage sellers and agents |
| `/admin/account-verifications` | Review identity and business documents |
| `/admin/products`, `/admin/services`, `/admin/categories`, `/admin/service-categories`, `/admin/store-types` | Catalog moderation and taxonomy |
| `/admin/orders` | Order oversight |
| `/admin/withdrawals` | Seller withdrawal requests |
| `/admin/disputes`, `/admin/returns`, `/admin/support` | Resolution queues |
| `/admin/fraud`, `/admin/fraud-dashboard` | Fraud flags |
| `/admin/settings` | Platform settings (see section 6) |
| `/admin/subscriptions`, `/admin/sponsorship`, `/admin/featured-stores` | Monetization products |
| `/admin/delivery-rates`, `/admin/pickup-points` | Delivery pricing and pickup points |
| `/admin/efd` | TRA fiscal receipts |
| `/admin/content` | Guides and content |
| `/admin/broadcast` | Messages to users |
| `/admin/maintenance`, `/admin/status-incidents` | Module maintenance and public incidents |
| `/admin/audit-logs` | Audit trail |
| `/admin/admins`, `/admin/data-reset` | Super admin only |

## 3. Daily routine (Proposed)

1. Dashboard and status: check `/health` and the public status page.
2. **Withdrawals** pending and approved (section 4).
3. **Account verifications** waiting.
4. **Disputes** nearing the 72-hour seller deadline; open returns.
5. **Refunds** needing manual completion (`manual_required`).
6. Fraud flags and wallet reconciliation flags; payments stuck in review.
7. Support tickets (first response target on the public SLA page is 24 hours).

## 4. Handling money

**Withdrawals** (`/admin/withdrawals`). Status flow: `pending` -> `approved` -> `paid`, or `rejected`.
- Check: the seller's verification tier, open disputes, payout destination (a new destination is held 24 hours automatically), amount versus balance.
- Approve only after checks. **The platform does not send the money.** Send it through your bank or mobile-money channel, then mark the request `paid` and record the **payout reference** (required). Payout currency is TZS or USD (the request stores the payout currency, amount and exchange rate; how the admin screen displays them was not verified).
- Reject with a short note so the seller understands.

**Refunds.** Dispute resolution can trigger a refund. The system tries the original provider (up to 3 attempts); if that fails or is impossible it sets `manual_required`: pay the buyer yourself outside the app and then update the refund record. The exact admin screen action for this was not verified. Only one refund exists per dispute.

**Held balances.** Seller earnings move from held to available automatically hourly when the order is delivered, the hold period has passed (default 5 days) and no dispute is open. Do not adjust balances by direct database edits: every change must go through the ledger (`wallet_transactions`), which supports an `adjustment` entry type. Which admin screen creates adjustments was not verified.

**Reconciliation.** Nightly jobs compare ledgers and provider state. Investigate every flag on `wallet_reconciliation_flags` and `payment_review_queue` the same day.

## 5. Moderation and verification

- **Account verification:** open documents through the guarded document links (do not copy documents to personal storage). Approve, reject with a reason, or request resubmission. Approval unlocks selling or delivering.
- **Suspensions:** suspend with a reason; the user is blocked on their next request and sees a suspension screen. Reactivate from the same page.
- **Disputes:** read both sides' evidence, decide within your target time, choose rejected (funds release resumes) or refund.
- **Returns:** follow the states requested, approved, shipped back, received, refunded; reject with a reason if outside the 7/14-day window or policy.

## 6. Settings that matter (`/admin/settings`; seeded defaults)

| Area | Keys (default) |
|---|---|
| Monetization switches | `monetization_commission_enabled` (off), `monetization_subscriptions_enabled` (off), `monetization_sponsorship_enabled` (off). **Turn on deliberately; they affect seller earnings.** Scheduling a future flip and the old "Billing Control Center" are not available in this version of the code. |
| Commission | `commission_rate` (10), `commission_rate_max` (30) |
| Escrow and disputes | `escrow_hold_days` (5), `dispute_seller_response_hours` (72), `return_window_days` (7), `return_window_insured_days` (14) |
| COD | `cod_auto_confirm_hours` (48), `cod_block_after_refused_count` (3) |
| Withdrawals | `withdrawal_min_amount` (5,000), `withdrawal_max_amount` (5,000,000), caps by tier (200,000 / 2,000,000 / 10,000,000), `withdrawal_new_payout_hold_hours` (24), `withdrawal_open_dispute_block_threshold` (3) |
| Top-ups | `topup_min_amount` (1,000), `topup_max_amount` (3,000,000), daily caps tier0/1/2 (500,000 / 2,000,000 / 10,000,000) |
| Delivery | `delivery_distance_bands`, `rider_delivery_fee` (3,000), `delivery_default_region`, `default_delivery_vehicle`, `delivery_handling_buffer_minutes`, fuel settings `fuel_passthrough_pct`, `fuel_max_monthly_change_pct`, `fuel_baseline_cap` |
| Promotion prices | `sponsorship_daily_rate` (5,000), `featured_store_daily_rate` (8,000) |
| Cart | `max_cart_line_items` (100), `max_quantity_per_cart_line` (500) |
| Retention | `approved_document_retention_days` (0 = do not keep approved documents) |
| AI | `ai_enabled` and four token caps (per user and global, daily and monthly) |
| Stock tools | `stock_default_reorder_level` (5), `stock_backdate_max_days` (7), `stock_offline_max_age_days` (30), `stock_export_grace_days` (30), `stock_low_alert_channels` (push) |
| Holiday theme | `holiday_theme_enabled` (off), `holiday_theme_mode` (auto), `holiday_theme_start_date`, `holiday_theme_end_date` (blank). See section 7. |
| Other | `username_blocklist`, `usd_exchange_rate_max_change_percent` (10) |

Settings apply without redeploying. Record every change (what, why, who) outside the app as well.

## 7. Platform controls

- **Maintenance** (`/admin/maintenance`): switch a module off with a user-facing message, or schedule a window. Users get "temporarily unavailable" for that module only.
- **Status incidents** (`/admin/status-incidents`): post, update and resolve incidents shown on the public status page.
- **Broadcast** (`/admin/broadcast`): email or notification to a segment; check the audience first.
- **Delivery rates and pickup points**: adjust bands and locations.
- **EFD** (`/admin/efd`): review fiscal receipts and failures; retries run every 30 minutes.
- **Audit logs**: filter by event type (for example login failures and admin account changes).
- **Holiday theme** (Christmas and New Year decorations on the storefront): see the steps below.

### Turning the holiday theme on or off

The theme is purely decorative (falling snow, header lights and a Santa hat for Christmas; gentle fireworks and gold sparkles for New Year). It never blocks clicks. Visitors who have Reduce Motion or Data Saver switched on never see it, and everyone else can switch it off with the small festive-decorations button in the header (their choice is remembered on their device).

**Settings** (saved in Platform settings, same audit trail as other settings; they apply within about a minute, with no redeploy):

| Setting | Values | Effect |
|---|---|---|
| `holiday_theme_enabled` | `true` / `false` | The main on/off switch. Off means no decorations for anyone. |
| `holiday_theme_mode` | `auto`, `christmas`, `newyear` | `auto` shows Christmas from 1 Dec to 26 Dec and New Year from 27 Dec to 3 Jan, and nothing the rest of the year. `christmas` or `newyear` forces that theme while the switch is on. |
| `holiday_theme_start_date`, `holiday_theme_end_date` | `YYYY-MM-DD`, or blank | Optional. The theme only shows between these dates (inclusive). A blank side is open-ended. |

"Today" is judged in Tanzania time (Africa/Dar_es_Salaam), so New Year starts at midnight in Dar es Salaam even though the server runs on UTC.

**To turn it on:** set `holiday_theme_enabled` to `true`, choose a mode (leave `auto` unless you want to override the calendar), and save. **To turn it off:** set `holiday_theme_enabled` to `false` and save. Changes are made with `PUT /api/v1/admin/settings` as an admin; the current values are returned by `GET /api/v1/admin/settings`. Check the result by opening the storefront in a private window: `GET /api/v1/holiday-theme` returns `{ "active": true|false, "mode": ... }`.

> **Note:** in this version of the code the Platform settings page does not yet show a Holiday theme card, so the switch is changed through the API above. Ask the developer to add the card if you want a button on the page.

**Environment settings** (server `.env`, need a restart; ask the developer):

- `HOLIDAY_THEME_DEFAULT=on|off`: the starting state until an admin first saves the setting. Off when unset.
- `HOLIDAY_THEME_FORCE_OFF=true`: emergency kill-switch. Turns the theme off everywhere whatever the admin setting says. Use it if the decorations ever misbehave, then set it back to `false` (or remove it) to let the admin setting apply again.
- `HOLIDAY_THEME_TIMEZONE`: optional; defaults to Africa/Dar_es_Salaam.

## 8. Super admin only

- `/admin/admins`: create, list, demote or remove admins. The last super admin cannot be demoted. Creation and level changes notify other admins.
- `/admin/data-reset`: destructive platform reset. It requires environment flags and an approval record and must **never be enabled in production**. Use only on test environments.

## 9. Troubleshooting

| Problem | Checks |
|---|---|
| Seller says funds not available | Order delivered? Hold days elapsed? Open dispute? Was the hourly `escrowRelease` job running (worker logs)? |
| Payment shows pending | Wait for the provider webhook; check `payment_review_queue`; confirm webhook secret configured; compare in the provider dashboard before any manual action |
| Low-stock alerts or pre-order reminders not sent | Known defect: these jobs are not scheduled in this codebase version (KNOWN-003) |
| Users cannot log in | Lockout (wait), email delivery (check Brevo and outbox retry), suspension |
| A module is down for everyone | Check `/admin/maintenance`; check `/health` and Sentry |
| Wrong amount charged | Check the commission and plan settings and switches; ledger rows in `wallet_transactions` |
| Cannot find a page that was in older docs | Department sponsorship is retired; its URLs redirect |

## 10. Items for owner decision before go-live

Which monetization switches to enable; who can approve payouts and whether two approvers are required; response-time targets; support contact details; legal text review; backup and incident procedures (`operations/maintenance-recovery.md`).
