# Nexora Services — Phase 3 (Financial Integration): Database layer

Follows the Phase 2 DB layer. This zip is **database only**. Backend and
frontend for Phase 3 follow as their own zips.

## What this adds

One migration: `database/migrations/064_services_financial_integration.sql`.

Per CHANGES.md's own "Payment Architecture" section ("Reuse the existing
Nexora payment infrastructure" — Wallet / Escrow / Earnings / Commission
Engine all listed as "Existing Components"), this does **not** introduce
a second payment/wallet/commission system for bookings. It widens the
product-side tables just enough for a booking to flow through the exact
same tables an order already does:

- **`payments.booking_id`** (nullable) + a third `purpose` value,
  `'booking_payment'` — a booking payment reuses `payments` exactly like
  a seller's verification fee already does (migration 019), not the
  order-payment shape. Orders have a predetermined `payment_method`
  chosen at checkout; bookings don't, so which gateway a buyer pays with
  is only known at the moment they call one of the initiate endpoints —
  the verification-fee shape, not the order one.
- **`booking_items`** gains `commission_rate`, `commission_amount`,
  `provider_net_amount`, `wallet_credited`, `wallet_released` — the exact
  same five-column shape migrations 017 + 054 added to `order_items`,
  just named for this domain (`provider_net_amount`, not
  `seller_net_amount`).
- **`wallet_transactions.reference_type`** gains one new value,
  `'booking'`, for the ledger row written when a booking's payment is
  confirmed and its provider's earnings are held. The release-side
  ledger row keeps reusing the existing `'escrow_release'` value
  unchanged.

## What this deliberately does NOT add

- **No `provider_payouts` table.** `seller_wallets` /
  `withdrawal_requests` are already keyed on `seller_id INT REFERENCES
  users(id)`, and `bookings.provider_id` is that same `users.id` (see
  062's design notes). A provider withdrawing booking earnings is
  already the exact same `wallet.service.js#requestWithdrawal` flow a
  product seller uses — Payouts needed zero schema changes.
- **No new `platform_settings` row.** `commission_rate` and
  `escrow_hold_days` (017, 054) are reused as-is — this is Commission
  Management's entire database footprint: none, because the rate/window
  mechanism already applied uniformly to whichever domain hands it a
  subtotal.
- **No dispute/refund schema changes.** CHANGES.md's Phase 3 scope is
  explicitly Escrow Integration / Payouts / Commission Management —
  disputes are `order_id`-shaped (034) and extending them to bookings is
  a bigger, separate schema decision this phase doesn't make. A paid
  booking that's cancelled reverses escrow and attempts an online refund
  directly (see the Phase 3 backend zip's `booking.service.js`), without
  a dispute row to hang it off of.

## Verification done in this sandbox

- Read against the live schema files (`schema/payments.sql`,
  `migrations/017`, `054`, `062`, `063`) to confirm every `ALTER`/`ADD
  CONSTRAINT` targets columns/tables that actually exist in that shape.
- **Not run against a live MySQL instance** — no database available in
  this sandbox. Please run this migration against your dev DB (after
  063) before relying on it; nothing here is destructive (`ADD COLUMN`,
  `ADD CONSTRAINT`, `MODIFY ... ENUM` widening only), but always confirm
  against a copy of production data first, as with any schema change.

## Files in this zip

```
database/migrations/064_services_financial_integration.sql   (new)
README-SERVICES-PHASE3-DB.md                                  (new, this file)
```

## Next: Backend, then Frontend + UI/UX

This migration is additive-only — existing order/verification-fee
payment flows are completely unaffected. The backend zip is what
actually reads/writes these new columns.
