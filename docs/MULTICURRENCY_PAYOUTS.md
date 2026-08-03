# Multi-Currency Seller Payouts (Phase 3c)

Part of the Revenue & Product Enhancements roadmap ("add multi-currency
seller payouts using existing currency infrastructure").

## Reused, not rebuilt

The roadmap explicitly asked to reuse existing currency infrastructure
rather than add a new one. NEXORA already had exactly one piece of
currency-conversion infrastructure: the admin-editable
`usd_exchange_rate` platform setting (`settings.service.js`), which
`paypal.provider.js` already uses to convert a TZS order total to USD
for PayPal checkout. Multi-currency payouts reuse that same setting and
the same `settingsService.getUsdExchangeRate()` call - no second
conversion mechanism, no new admin setting.

## What changed

- Migration `075_multicurrency_payouts.sql` (written earlier in this
  roadmap phase, wired up now): `withdrawal_requests` gained
  `payout_currency` (TZS/USD, defaults to TZS), `payout_amount`
  (the converted amount, NULL for TZS payouts), and
  `payout_exchange_rate` (the rate actually used, snapshotted at request
  time).
- A seller's **wallet balance stays TZS-denominated** - every
  order/booking commission calculation elsewhere in `wallet.service.js`
  is untouched. Only the payout leg gains a currency choice:
  `requestWithdrawal(sellerId, amount, payoutMethod, payoutDetails, payoutCurrency)`
  computes and snapshots the USD conversion when `payoutCurrency ===
  "USD"`, exactly the way `order_items.commission_rate` already
  snapshots a rate at credit time so a later setting change never
  rewrites history (017's own design reasoning, reused here).
- Seller (`SellerWallet.jsx`) gets a currency selector on the withdrawal
  form and sees the converted amount + rate on each request. Admin
  (`AdminWithdrawals.jsx`) sees the same conversion detail when deciding
  how to pay a seller out.

## What's deliberately out of scope

- Actual disbursement in USD (e.g. a PayPal Payouts API integration) -
  this phase records what currency/amount a seller expects and lets an
  admin see it when processing the withdrawal manually (the existing
  approve/reject/mark-paid flow, unchanged); it doesn't wire a new
  payment-provider payout API. Bank transfer and mobile money payouts
  were already manual/admin-mediated before this phase, so this doesn't
  reduce the existing manual-review workflow's safety.
- Currencies beyond TZS/USD - the roadmap said "reuse existing currency
  infrastructure," and USD is the only currency that infrastructure
  (`usd_exchange_rate`) currently supports.
