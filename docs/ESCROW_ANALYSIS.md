# Escrow / Payment Trust System — Analysis (Phase 9A)

This document is the Phase 9A deliverable: an audit of how money actually
moves through NEXORA today, the specific problem Phase 9 exists to fix,
and the design this phase proposes for Phases 9B–9D. **No application
code changes in this phase** — 9A is analysis only, so that 9B (schema),
9C (holding logic) and 9D (release logic) are built against a single
agreed design instead of each improvising as it goes.

## 1. How payment → payout works today

Traced end-to-end from `payment.service.js`, `wallet.service.js`,
`dispute.service.js` and the relevant migrations:

1. Buyer pays (mobile money via Selcom/MalipoPay, card via Snippe, or
   PayPal). The provider's webhook lands on
   `payment.service.js#_handleOrderPaymentWebhook`, which marks the
   `payments` row `completed` and the order `payment_status = 'paid'`.
2. In the **same call**, `walletService.creditSellersForOrder(orderId)`
   fires (fire-and-forget). This splits the order's `order_items` by
   seller, deducts the platform commission
   (`settings.commission_rate`), and immediately increments each
   seller's `seller_wallets.balance` — before the item has shipped, let
   alone been delivered.
3. Cash on Delivery follows the same final step: `confirmCashOnDelivery`
   (seller-triggered, only callable once `order.status = 'delivered'`)
   also calls `creditSellersForOrder`. COD money is collected by the
   seller in person and never passes through the platform, so this
   credit is a bookkeeping entry, not a transfer of platform-held funds
   — noted in §5, out of scope for the escrow mechanism itself.
4. A seller can request a withdrawal (`walletService.requestWithdrawal`)
   for any amount up to their current balance, at any time. Nothing
   about order status, delivery, or a dispute window gates this.
5. If a buyer later opens a dispute
   (`dispute.service.js#createDispute` — allowed any time after
   `order.status` leaves `pending`/`cancelled`, **with no deadline**)
   and an admin resolves it with a refund
   (`dispute.service.js#resolveDispute` → `reverseSellerEarnings`), the
   seller's wallet is debited for the refunded amount via a plain
   `incrementBalance(sellerId, -amount)` call — with **no floor check**.
   `requestWithdrawal` does check `amount > wallet.balance` and rejects,
   but `reverseSellerEarnings` has no equivalent guard.

## 2. The problem this phase exists to fix

Steps 2 and 4 together are the gap: a seller is paid in full, in cash-
withdrawable form, the moment `payment_status` flips to `paid` —
days or weeks before the buyer has received anything, let alone had a
chance to inspect it. Nothing currently stops a seller from withdrawing
that balance before delivery, or before the (currently unbounded) dispute
window closes. If they do, step 5's clawback has nothing left to claw:
`seller_wallets.balance` goes negative, and `docs/REFUNDS.md` already
documents that the buyer-side refund still happens automatically
regardless — so a bad-faith or simply fast-moving seller can walk away
with money the platform then has no wallet balance to recover from,
leaving the loss on the platform (or as an off-system, manual seller
debt).

This is exactly the trust gap "escrow" is meant to close: **hold the
seller's earnings somewhere the seller can't withdraw from until
delivery has happened and the dispute window on it has passed**, then
release automatically. This doesn't require a third-party escrow
provider — the money is already platform-held from the moment a mobile
money/Snippe/PayPal webhook confirms payment; the fix is entirely about
*when* `seller_wallets.balance` (the withdrawable figure) is credited,
not about where the cash physically sits.

## 3. Proposed model (for 9B/9C/9D to build)

### 3.1 New concept: held vs. available balance

Split what a seller's wallet page currently shows as a single `balance`
into two figures:

- **Held** — earnings from orders that are paid but not yet past their
  release point. Visible to the seller (so they can see money is
  coming) but **not withdrawable**.
- **Available** — today's `balance`: released, withdrawable earnings.
  `requestWithdrawal`'s existing `amount > wallet.balance` check keeps
  working unchanged once `balance` means "available only".

This means `creditSellersForOrder` (Phase 9C) stops incrementing
`balance` directly and instead creates a **held** entry per seller per
order. A separate release step (Phase 9D) is what moves it into
`balance`. `wallet_transactions` already has a `reference_type` enum
(`order`, `withdrawal`, `adjustment`) — extending it to distinguish a
hold entry from a release entry keeps one ledger table serving both,
consistent with how the rest of the wallet module already models
everything as ledger rows plus a running balance.

### 3.2 Release trigger

Two conditions, both required:

1. **Delivered** — `order.status = 'delivered'` (already timestamped:
   `deliveries.delivered_at`, migration 037).
2. **Hold period elapsed** — a configurable number of days after
   delivery with no open dispute on the order. Modeled the same way
   every other tunable platform number already is
   (`settings.commission_rate`, `settings.rider_delivery_fee`, etc.):
   a new `settings.escrow_hold_days` row via `settings.service.js`'s
   existing `DEFAULTS` pattern, so it's admin-editable with no deploy.

If a dispute is opened on an order/item before the hold period elapses,
that seller's held amount for it stays held until the dispute resolves
(rejected → release proceeds on its original schedule; resolved with a
refund → §3.1's held entry is reduced/cleared instead of ever touching
`balance`, which is a strictly safer version of today's
`reverseSellerEarnings` clawback since there's nothing to claw back from
an amount that was never released).

Cash on Delivery is excluded from holding: since the seller has already
received the cash in person by the time `confirmCashOnDelivery` can even
be called (it requires `order.status = 'delivered'` already), there is
no platform-held money to hold back. Its wallet entry can continue to
land as before, or — a smaller, cleaner option worth deciding in 9C —
stop crediting the wallet for COD at all, since the "balance" is
supposed to represent money the platform owes the seller, and for COD
the platform owes nothing (the seller already has the cash). This
existing COD-wallet-crediting behavior predates Phase 9 and isn't a bug
this phase needs to fix, but 9C should make a deliberate call on it
rather than silently carrying it forward.

### 3.3 Multi-vendor orders

No change needed to the existing parent/child order structure
(`is_parent`, `findChildOrders`) — Phase 9C's held-entry creation should
key off the same per-child-order webhook path
`_handleOrderPaymentWebhook` already uses today, so each child order's
delivery status (not the parent's) independently gates its own sellers'
release, matching how delivery already works per child order.

### 3.4 Admin override

An admin-triggered early release (e.g. a buyer explicitly confirms
receipt and is happy, or an admin wants to close out a stale/edge-case
order) should exist as an explicit action in 9D, mirroring how
`walletService.processWithdrawal` is already an explicit admin action
with its own audit trail (`wallet_transactions` row + notification) —
not a side effect of some other endpoint.

## 4. Open decisions for 9B/9C/9D (flagged, not resolved here)

- **Default `escrow_hold_days` value.** No existing precedent in this
  codebase to anchor it to; needs a product/business call, not a
  technical one. Suggest defaulting conservatively (e.g. 3–7 days) and
  leaving it admin-tunable, same as commission rate.
- **Does a buyer "confirm receipt" action exist**, letting a buyer
  voluntarily release funds before the hold period elapses? Nothing
  like this exists today. Out of scope for 9B (schema) but 9C/9D should
  decide whether to build it now or leave it for a later phase.
- **Retroactive handling.** Orders already paid and already credited to
  `balance` under the current (non-held) behavior, at the moment 9C
  ships — do they get left alone (simplest, no risk of double-charging
  a seller who may have already withdrawn) or reconciled? Recommend
  leaving historical balances untouched and only applying the hold to
  orders paid after 9C ships, called out explicitly in 9C's own README
  and migration comments.
- **COD wallet crediting** — see §3.2's note. Needs an explicit decision
  in 9C, not a carried-forward default.

## 5. Non-goals of Phase 9

- No third-party escrow provider integration. All four payment
  providers (mobile money, Snippe, PayPal) already deposit into
  platform-controlled flow; escrow here means changing *when* the
  platform's own ledger makes funds withdrawable, not adding a new
  money-transit path.
- No changes to the refund providers or `refund.service.js`'s
  buyer-side automation (`docs/REFUNDS.md`) — this phase is entirely
  about the seller-payout side.
- No changes to delivery-agent earnings (`deliveries.earnings_credited`)
  — riders are paid a flat fee per delivery, not a share of the order
  total, and are outside this trust problem.

## 6. Scope split for the remaining Phase 9 sub-phases

| Phase | Scope |
|---|---|
| 9B — Escrow Foundation | Schema: split held/available (§3.1), `settings.escrow_hold_days` (§3.2), `wallet_transactions.reference_type` extended for hold/release entries. No behavior change yet — additive schema only, existing crediting keeps working until 9C switches it over. |
| 9C — Payment Holding | `creditSellersForOrder` writes to held instead of `balance`; decide + implement the COD question (§3.2); wallet UI/API exposes held vs. available. |
| 9D — Seller Release | Background job (same pattern as the existing `staleOrders` job referenced in `payment.repository.js#findStalePending`) that releases held → available once delivered + hold period elapsed with no open dispute; dispute-open freeze; admin manual early-release action. |
