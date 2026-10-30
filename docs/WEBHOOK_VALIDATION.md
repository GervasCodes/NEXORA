# Webhook Validation

Documents exactly how NEXORA authenticates each inbound payment-gateway
webhook, so a reviewer can check the claim "we don't trust unauthenticated
webhook payloads" against the code.

All webhook endpoints live under `/api/v1/payments/webhooks/*`. Selcom and
AzamPay are in `backend/src/modules/payment/payment.routes.js`; PawaPay (and
PayPal) are registered directly in `backend/src/app.js` because they need the
raw request bytes (see §3).

## 1. Selcom and AzamPay — shared-secret verification

**Endpoints:** `POST /payments/webhooks/selcom`, `POST /payments/webhooks/azampay`
**Middleware:** `backend/src/middleware/webhookAuth.middleware.js`
(`verifySelcomWebhook` / `verifyAzampayWebhook`)

Neither gateway signs the body, so authenticity rests on a secret only the
gateway and NEXORA know.

| Gateway | Secret | Accepted in | Payload fields read |
|---|---|---|---|
| Selcom | `SELCOM_WEBHOOK_SECRET` | `Authorization: Bearer <secret>` | `order_id` or `transid`, `payment_status` / `resultcode` / `result` |
| AzamPay | `AZAMPAY_WEBHOOK_SECRET` | `Authorization: Bearer <secret>`, `x-webhook-secret`, or `?secret=` on the callback URL | `utilityref` (our reference), `transactionstatus`, `amount`, `reference` |

Optional source-IP restriction: `SELCOM_WEBHOOK_ALLOWED_IPS`,
`AZAMPAY_WEBHOOK_ALLOWED_IPS`.

**Validation logic:**

1. If the secret is **not set**: reject (fail closed) in every environment.
   Only an explicit `ALLOW_UNSIGNED_WEBHOOKS=true` lets it through, and that is
   ignored in production.
2. Reject if the source IP is outside the configured allowlist.
3. Compare the supplied secret with `crypto.timingSafeEqual` (constant time).
4. Reject a byte-for-byte replay of an already-recorded delivery (§5).

If the AzamPay secret goes in the callback URL it will appear in access logs on
any proxy in front of the API; prefer the header form where the AzamPay
dashboard allows it.

Both handlers (`selcomWebhook`, `azampayWebhook` in `payment.controller.js`)
also reject — `200 { success: false }`, logged at `warn` — a payload whose
reference field is missing or not a string, instead of letting it surface as an
unhandled exception.

## 2. Status mapping and amount check

`providerStatus.js` maps each gateway's status words to `success` / `failed` /
`pending`. Pending or unknown statuses are acknowledged and ignored — never
treated as a failure. A reported amount that does not match the expected amount
(within `PAYMENT_AMOUNT_TOLERANCE_PERCENT`, default 0.5%) is routed to the admin
payment-review queue instead of marking the payment paid.

## 3. PawaPay — RFC 9421 signature over the raw body

**Endpoint:** `POST /payments/webhooks/pawapay`
**Verification:** `providers/pawapay.provider.js#verifyCallbackSignature`

PawaPay signs callbacks with HTTP Message Signatures (RFC 9421): a
`Content-Digest` of the body plus a `Signature` / `Signature-Input` pair
(ECDSA P-256, `ieee-p1363` encoding) over `@method`, `@authority`, `@path` and
`content-digest`. Public keys come from PawaPay's `/v2/public-key/http` and are
cached.

Because the digest covers the exact bytes, this route is registered in `app.js`
**before** `express.json()` with `express.raw({ type: "application/json" })`.

**Validation logic** (`pawapayWebhook`):

1. Invalid JSON: `400`.
2. If a `Signature` header is present, it must verify; otherwise `400`.
3. If there is no signature, the callback is rejected (`400`) unless
   `PAWAPAY_ALLOW_UNSIGNED_CALLBACKS=true` (development only). An accepted
   unsigned callback is never trusted on its own: the deposit's status is
   re-read from PawaPay's `GET /v2/deposits/{id}` and that answer is used.
4. Callbacks without a `depositId` (payout / refund results) are acknowledged
   and ignored.
5. `COMPLETED` / `FAILED` are applied; anything else (e.g. `PROCESSING`,
   `IN_RECONCILIATION`) is ignored. The replay guard (§5) then runs.

`PAWAPAY_CALLBACK_AUTHORITY` overrides the host used when rebuilding the signed
`@authority` — set it if a proxy rewrites `Host`.

A rejected PawaPay callback returns `400`, since it will never become valid.

## 4. PayPal — server-side capture instead of a push webhook

The buyer-facing flow does not trust the browser redirect. Our backend calls
PayPal's Capture API with the `paypalOrderId`, and only PayPal's own response
decides whether the payment is marked completed. A forged `paypalOrderId` cannot
mark an arbitrary NEXORA order as paid. (A raw-body PayPal webhook route is also
registered in `app.js`.)

## 5. Replay protection

`utils/webhookReplayGuard.js` adds two independent guards on top of idempotent
payment handling:

- a timestamp-freshness window (5 minutes) where a payload carries its own
  timestamp, and
- a SHA-256(provider + raw payload) dedup against `webhook_replay_guard`
  (migration 072), which works even when a gateway sends no timestamp or nonce.

If processing fails transiently (e.g. database down), the handler answers `5xx`
and releases the dedup row so the gateway's retry is processed.

## 6. Why Selcom / AzamPay rejections return `200`

A rejected Selcom or AzamPay webhook still returns HTTP `200 { success: false }`.
Most gateways treat any non-2xx as "delivery failed" and retry aggressively;
a request rejected for a bad secret will never become valid, so a `200` stops
the retry storm. The security decision and the HTTP status are deliberately
decoupled. (PawaPay rejections return `400`, see §3.)

## 7. Logging

Rejected webhooks log at `warn` (and `Sentry.captureMessage` at warning level
for PawaPay), not `error`: bad secrets and signatures on known webhook URLs are
background noise from scanners. Genuine failures while processing an
authenticated webhook are reported at `error`.

## 8. Known gaps

- **Not verified against live sandboxes.** Field names and mechanisms follow
  each gateway's public documentation and are covered by tests
  (`tests/integration/payment.webhooks*.test.js`,
  `tests/unit/payment/pawapay.provider.test.js`,
  `tests/unit/webhookAuth.middleware.test.js`), but not a real round trip.
  **Run one sandbox payment per gateway before go-live.** Sample payloads are in
  `tests/fixtures/webhookPayloads.js`.
- **Shared secrets are static.** Selcom and AzamPay do not sign requests, so a
  leaked secret lets anyone submit callbacks. Use the IP allowlists where the
  gateway publishes source ranges.
- **Generic fallback.** `verifySharedSecretHeader` remains available, unwired,
  for a gateway whose real behaviour differs from its docs.
