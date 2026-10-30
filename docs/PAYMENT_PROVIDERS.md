# Payment Providers

Companion to `docs/ESCROW_PAYMENT_FLOW.md` (money-movement lifecycle) and
`docs/WEBHOOK_VALIDATION.md` (webhook auth). This document covers the
provider layer itself: which rails and gateways exist, how they are
selected, and how to add another.

## 1. Rails and gateways

Buyers see three gateway rails. Which concrete gateway sits behind a rail is
an environment setting, not a code change.

| Rail (`payments.method`) | Router | Gateways | Selected by | Style |
|---|---|---|---|---|
| `mobile_money` | `providers/mobileMoney.provider.js` | AzamPay, Selcom, PawaPay | `MOBILE_MONEY_PROVIDER` | USSD push: `initiate(phone, amount, meta)` returns a pending reference |
| `card` | `providers/card.provider.js` | Selcom, AzamPay | `CARD_PROVIDER` | Hosted checkout: `createCheckoutSession(...)` returns a redirect URL |
| `paypal` | `providers/paypal.provider.js` | PayPal | credentials set | Hosted order/capture |

Cash on delivery and the buyer wallet are not external gateways.

**PawaPay is mobile money only.** It collects from mobile-money wallets and
has no card product, so `CARD_PROVIDER=pawapay` is rejected (reported by
`validateRegistry` at boot, and the card rail stays off).

Every mobile-money gateway exports `isConfigured()`, `initiate()`,
`refund()`, `disburse()` and (where the gateway has a lookup) `checkStatus()`.
Every card gateway exports `isConfigured()` and `createCheckoutSession()`.

`payments.provider` (migration 161) records which gateway took each payment.
Status checks and refunds go back to that gateway even if the env setting is
changed later. Legacy rows taken through the retired Snippe / MalipoPay
gateways keep their old name there; refunds for them fail with a "refund
manually from that gateway's dashboard" message.

## 2. Environment

See `backend/.env.example` (payments section) for the full list.

| Gateway | Variables |
|---|---|
| Selcom | `SELCOM_API_BASE_URL`, `SELCOM_API_KEY`, `SELCOM_API_SECRET`, `SELCOM_VENDOR_ID`, `SELCOM_WEBHOOK_SECRET` (falls back to `MOBILE_MONEY_*` names) |
| AzamPay | `AZAMPAY_API_BASE_URL`, `AZAMPAY_AUTH_BASE_URL`, `AZAMPAY_APP_NAME`, `AZAMPAY_CLIENT_ID`, `AZAMPAY_CLIENT_SECRET`, `AZAMPAY_VENDOR_ID` (card only), `AZAMPAY_WEBHOOK_SECRET` |
| PawaPay | `PAWAPAY_API_BASE_URL`, `PAWAPAY_API_TOKEN`, `PAWAPAY_ALLOW_UNSIGNED_CALLBACKS` (dev only) |
| PayPal | `PAYPAL_*` |

## 3. Gateway flows

- **Selcom** — mobile: `create-order-minimal` then `wallet-payment` (USSD push).
  Card: `create-order`, which returns a base64 `payment_gateway_url`. Requests
  are HMAC-signed (timestamp first in the digest string); `Authorization` is
  `SELCOM base64(key)`. Status lookup: `order-status`. Refund and payout use
  `/v1/payout/process` — **confirm this against Selcom's docs before relying on it.**
- **AzamPay** — a bearer token is fetched from a separate authenticator host.
  Mobile: `/azampay/mno/checkout`, network detected from the phone prefix.
  Card: `/api/v1/Partner/PostCheckout` returns AzamPay's hosted page. There is
  no status-lookup endpoint wired up; stale payments rely on the webhook and
  the age cutoff. Refunds are disbursements back to the buyer's phone.
- **PawaPay** — `POST /v2/deposits` after a predict-provider call to find the
  buyer's network. The `depositId` is a deterministic UUID derived from our
  payment reference and stored as `transaction_reference`. Refunds use
  `/v2/refunds` when the depositId is known, otherwise a payout.

Adapters were written from each gateway's public documentation and are covered
by unit tests with mocked HTTP. **They have not been run against live
sandboxes** — do that before go-live.

## 4. The registry (`providers/registry.js`)

A read-only capability layer over the three rails:

- `getProvider(key)` / `listProviders()` — capability metadata, the active
  `gateway` name, and a live `configured` flag.
- `listConfiguredProviders()` — the buyer-facing subset; backs
  `GET /payment/methods`, so checkout only shows rails that are really set up.
- `validateRegistry(logger)` — run at boot; warns (never throws) about a
  malformed provider or an invalid `CARD_PROVIDER`.

The `card` entry carries `type: "card"` and `primary: true`; `Checkout.jsx`
reads these to build its card option instead of hardcoding gateway keys.

## 5. Adding another gateway

**Another mobile-money gateway:** create `providers/<name>.provider.js` with the
mobile-money shape above, add one line to `providers` in
`mobileMoney.provider.js`, add a status classifier in `providerStatus.js` and a
webhook route/handler (with auth in `webhookAuth.middleware.js`), then set
`MOBILE_MONEY_PROVIDER=<name>`.

**Another card gateway:** create the adapter with `createCheckoutSession`, add
it to `providers` in `card.provider.js`, plus a webhook route as above.

**A new kind of rail** needs service functions in `payment.service.js`, routes
in `payment.routes.js`, a registry entry, an ENUM migration (pattern:
`migrations/161_gateways_azampay_selcom_pawapay.sql`), an entry in
`constants/orderStatus.js#PAYMENT_METHODS`, and a refund branch in
`refund.service.js#callProvider`.

## 6. `GET /payment/methods`

Requires auth, takes no parameters, returns the configured rails:

```json
{
  "success": true,
  "data": [
    { "key": "card", "label": "Card", "type": "card", "primary": true, "capabilities": { "...": "..." }, "configured": true },
    { "key": "mobile_money", "label": "Mobile Money", "capabilities": { "...": "..." }, "configured": true },
    { "key": "paypal", "label": "PayPal", "capabilities": { "...": "..." }, "configured": true }
  ]
}
```

It is registered ahead of `GET /:orderId` for the same reason as the other
literal paths: Express matches in registration order.
