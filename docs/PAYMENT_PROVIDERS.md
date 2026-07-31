# Payment Providers

Phase 5 (Resilience & Growth) deliverable. Companion to
`docs/ESCROW_PAYMENT_FLOW.md` (which covers the money-movement lifecycle)
and `docs/WEBHOOK_VALIDATION.md` (which covers webhook auth) — this
document covers the provider layer itself: what rails exist, how they're
selected, and how to add a new one.

## 1. The three rails today

| Rail | Module | Auth model | Style |
|---|---|---|---|
| Mobile Money | `providers/mobileMoney.provider.js` (router over `malipopay.provider.js` / `selcom.provider.js` / `azampay.provider.js`) | static API key (MalipoPay), HMAC-signed requests (Selcom), short-lived bearer token (AzamPay) | USSD push — `initiate(phone, amount, meta)` returns `pending`, buyer confirms on their phone, result arrives later via webhook |
| Snippe | `providers/snippe.provider.js` | secret key + signed webhooks | hosted checkout session — `createCheckoutSession(...)` returns a redirect URL |
| PayPal | `providers/paypal.provider.js` | OAuth client id/secret | hosted order/capture — `createOrder(...)` returns an approve URL, `captureOrder(...)` finalizes |

Every mobile-money sub-provider (MalipoPay, Selcom, AzamPay) exports the
same four functions — `isConfigured()`, `initiate()`, `refund()`,
`disburse()` — so `mobileMoney.provider.js` can route between them purely
on `MOBILE_MONEY_PROVIDER` in `.env` with no other file changing. Snippe
and PayPal are structurally different enough (redirect-based, not
USSD-push) that they're driven directly by `payment.service.js` rather
than through that same router.

## 2. The registry (`providers/registry.js`)

Added in Phase 5. A read-only capability layer over all three rails —
it does not replace any of `payment.service.js`'s existing initiate/
refund/webhook functions (see the comment at the top of `registry.js`
for why forcing all three rails through one generic call signature
wasn't a change worth making without a test run backing it). What it
adds:

- `getProvider(key)` / `listProviders()` — capability metadata (does
  this rail support orders, bookings, verification fees, refunds,
  disbursement, does it require a redirect) plus a live `configured`
  flag per rail.
- `listConfiguredProviders()` — the buyer-facing subset: only rails an
  admin has actually set credentials for. Backs the new
  `GET /payment/methods` endpoint, so a checkout screen can show only
  what's real instead of hardcoding all three and finding out one 401s.
- `validateRegistry(logger)` — called once at boot (`server.js`), warns
  (never throws — an unconfigured rail is normal, not an error) if a
  registered provider's shape is broken.

## 3. Adding a fourth mobile-money rail

This is the pattern `azampay.provider.js` followed, added in this same
phase as the worked example:

1. Create `providers/<name>.provider.js` exporting `isConfigured()`,
   `initiate(phone, amount, meta)`, `refund(phone, amount, meta)`,
   `disburse(phone, amount, meta)` — same shape as
   `malipopay.provider.js`.
2. Add one line to the `providers` map in `mobileMoney.provider.js`.
3. Set `MOBILE_MONEY_PROVIDER=<name>` and that provider's credentials in
   `.env` when ready to go live with it.

Nothing in `payment.service.js`, `payment.controller.js`, or
`payment.routes.js` needs to change — the router and the registry both
pick the new rail up automatically. `registry.js`'s `mobile_money` entry
already reflects "whichever rail `MOBILE_MONEY_PROVIDER` currently
selects," so no registry edit is needed either.

## 4. Adding a genuinely new kind of rail (redirect-based, card network, etc.)

A rail that doesn't fit the mobile-money shape (e.g. a new hosted-
checkout or card-network provider, similar in spirit to Snippe/PayPal)
needs more than a drop-in file, since `payment.service.js` currently
drives Snippe and PayPal with rail-specific functions
(`initiateSnippeOrderPayment`, `initiatePaypalOrderPayment`, etc.) — not
through a single generic entry point. Adding one means:

1. A new `providers/<name>.provider.js` with whatever call shape that
   provider's API actually needs (a checkout-session creator, an
   order/capture pair, etc.) — don't force it into the mobile-money
   shape if it isn't USSD-push.
2. New `initiate<Name>OrderPayment` / `initiate<Name>BookingPayment` /
   `initiate<Name>VerificationFeePayment` functions in
   `payment.service.js`, mirroring the existing Snippe/PayPal ones.
3. New routes in `payment.routes.js` (mind the literal-path-before-
   `/:orderId` ordering rule already documented at the top of that
   file) and a webhook route if the provider needs one.
4. A new entry in `providers/registry.js`'s `PROVIDERS` array with
   accurate `capabilities` — this is what makes the new rail show up in
   `GET /payment/methods` once it's configured.
5. Add the new `payment_method` value wherever `orders.payment_method` /
   `bookings.payment_method` are validated (see `docs/DATABASE.md`) —
   this is a schema/enum change and checkout UI work, intentionally
   **not** included in Phase 5's "preparation" scope.

## 5. `GET /payment/methods`

New in Phase 5. Requires auth (any logged-in role), takes no
parameters, returns `providerRegistry.listConfiguredProviders()`:

```json
{
  "success": true,
  "data": [
    { "key": "mobile_money", "label": "Mobile Money", "capabilities": { "...": "..." }, "configured": true }
  ]
}
```

Registered ahead of the existing `GET /:orderId` route in
`payment.routes.js`, for the same reason the verification-fee routes
above it are — Express matches route registration order, and
`/methods` has the same single-segment shape as `/:orderId`.
