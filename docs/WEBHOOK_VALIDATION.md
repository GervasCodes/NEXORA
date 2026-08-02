# Webhook Validation

Phase 3 (External Review Readiness) deliverable. Documents exactly how
NEXORA authenticates each inbound payment-provider webhook today, so an
external reviewer can verify the claim "we don't trust unauthenticated
webhook payloads" against the actual code rather than take it on faith.

All webhook endpoints are mounted under `/api/v1/payments/webhooks/*`
(see `backend/src/modules/payment/payment.routes.js` and the one
route registered directly in `backend/src/app.js` for Snippe — see §2).

## 1. MalipoPay & Selcom — shared-secret header

**Endpoints:** `POST /payments/webhooks/malipopay`,
`POST /payments/webhooks/selcom`
**Middleware:** `backend/src/middleware/webhookAuth.middleware.js`
**Mechanism:** a static shared secret, configured on the provider's
dashboard as a custom webhook header, compared against
`MALIPOPAY_WEBHOOK_SECRET` / `SELCOM_WEBHOOK_SECRET`.

```
Request header expected:  X-Webhook-Secret: <configured secret>
```

**Validation logic** (`verifyWebhookSecret`, applied per-provider):

1. If the env var (`MALIPOPAY_WEBHOOK_SECRET` / `SELCOM_WEBHOOK_SECRET`)
   is **not set**:
   - In `NODE_ENV=production` → **reject**, fail closed
     (`200 { success: false }` — see §4 for why 200 and not 401/403).
   - Outside production → allow through, so local development doesn't
     require a secret to test with a hand-crafted payload.
2. If the header is missing or doesn't match the configured secret →
   **reject**, logged at `warn` (not `error` — see §5).
3. Otherwise → pass through to `payment.controller.js`'s handler.

**Why a shared secret and not HMAC-over-body here:** this is documented
in-code as a deliberate, portable baseline — most providers support a
custom webhook header even before you have their full API docs/sandbox
access. If MalipoPay/Selcom's real integration instead signs the body
with HMAC (many mobile-money gateways do), that's a strictly stronger
mechanism and should replace this once their actual webhook
documentation is confirmed. **This is flagged as a known gap, not
presented as final** — see §6.

## 2. Snippe — HMAC-SHA256 signature over the raw body

**Endpoint:** `POST /payments/webhooks/snippe`
**Verification:** `backend/src/modules/payment/providers/snippe.provider.js#constructWebhookEvent`
**Mechanism:** HMAC-SHA256 of the raw request body, keyed with
`SNIPPE_WEBHOOK_SECRET`, compared against the `Snippe-Signature` header
using a constant-time comparison.

```
Request header expected:  Snippe-Signature: <hex HMAC-SHA256 digest>
```

**Why this route is wired differently in `app.js`:** HMAC verification
needs the *exact raw bytes* of the request body — once
`express.json()` parses it into a JS object, the original bytes are
gone and can't be re-derived byte-for-byte (whitespace, key order, etc.
aren't guaranteed to round-trip). So this one route is registered
**before** the global `express.json()` middleware, with its own
`express.raw({ type: "application/json" })` parser:

```js
app.post(
    "/api/v1/payments/webhooks/snippe",
    express.raw({ type: "application/json" }),
    require("./modules/payment/payment.controller").snippeWebhook
);
```

Express matches this specific route first and never falls through to
the later `express.json()` for this path — every other route
(including MalipoPay/Selcom, which verify a header rather than a body
signature) goes through the normal JSON parser unaffected.

**Validation logic** (`constructWebhookEvent`):

1. Reject if Snippe isn't configured (`SNIPPE_SECRET_KEY` unset) or
   `SNIPPE_WEBHOOK_SECRET` isn't set — **fails closed**: an unverifiable
   webhook is never accepted, in any environment (stricter than the
   shared-secret providers in §1, which allow through in non-production
   when unset).
2. Reject if the signature header is missing.
3. Compute `HMAC-SHA256(rawBody, SNIPPE_WEBHOOK_SECRET)` and compare to
   the provided header using `crypto.timingSafeEqual` — a **constant-time
   comparison** (not `===`), specifically to avoid a timing side-channel
   that could let an attacker guess the correct signature byte-by-byte.
   Buffer lengths are compared first, since `timingSafeEqual` throws on
   mismatched-length buffers rather than returning `false`.
4. Only after signature verification passes is the raw body parsed as
   JSON and returned as the event object.

**Response codes:** a rejected Snippe webhook returns `400` (this
correctly signals "not Snippe" — no reason to retry a request that will
never become valid), unlike MalipoPay/Selcom (see §4).

## 3. PayPal — no inbound webhook; server-side capture instead

PayPal doesn't use a push webhook at all in this integration.
`capturePaypalPayment` (`payment.controller.js`) is called by **our own
frontend** after the buyer/seller is redirected back from PayPal's
hosted approval page — but the code explicitly does not trust that
redirect as proof of payment:

> "Never trust the redirect itself as proof of payment; PayPal's capture
> response is the only thing that matters." — `payment.controller.js`

The actual trust boundary is server-to-server: our backend calls
PayPal's Capture API directly with the `paypalOrderId`, and only PayPal's
own API response (not anything the browser sends) determines whether
`handleProviderWebhook` marks the payment completed. A forged
`paypalOrderId` from a malicious client would simply fail (or capture a
different, unrelated PayPal order that client doesn't control funds on)
— it can't mark an arbitrary NEXORA order as paid.

## 4. Why webhook rejections return `200`, not `401`/`403`

For MalipoPay and Selcom specifically (not Snippe — see §2), a rejected
webhook still returns HTTP `200 { success: false }`. This is intentional:
most payment providers treat any non-2xx response as "delivery failed"
and retry-storm the same webhook aggressively (sometimes for hours).
Since a rejected-for-bad-secret request is not going to become valid on
retry, giving it a "success" status code at the transport level
(regardless of the `success: false` in the body) stops that retry storm
without ambiguity for the provider's delivery system. **The security
decision (reject/accept) and the HTTP status code are deliberately
decoupled** — this is documented in-line in
`webhookAuth.middleware.js` and is worth an external reviewer
confirming they agree with the trade-off, since it differs from the more
common "4xx on auth failure" convention.

## 5. Logging discipline: rejected webhooks are `warn`, not `error`

Both the shared-secret middleware and the Snippe signature check log
rejections at `warn` level and (for Snippe) `Sentry.captureMessage` at
`warning`, not `Sentry.captureException`. This is a deliberate choice: an
invalid/missing secret or signature on a webhook path is expected
background noise (scanners and bots probing known payment-webhook URLs
found via the codebase, provider docs, or brute-forcing common paths),
not evidence of an application bug — treating every rejected forgery as
an "error"-severity incident would drown real error signal. Genuine
application errors *while processing an already-authenticated* webhook
(e.g. a DB failure crediting a wallet) are still reported at `error` /
`Sentry.captureException` — see `payment.controller.js`'s
`malipopayWebhook`/`selcomWebhook` handlers and Phase 2's observability
work (`PHASE2_CHANGELOG.md`).

## 6. Known gaps / open items for reviewers

Flagging rather than silently presenting as resolved:

- **MalipoPay/Selcom payload shapes are not confirmed against real
  provider documentation.** The field names read in
  `payment.controller.js` (`payload.reference`, `payload.status`,
  `payload.transid`, `payload.resultcode`, etc.) follow each provider's
  commonly documented pattern but haven't been verified against live
  sandbox access. Confirm before relying on this in production.
- **Shared-secret vs. HMAC.** If either provider's real dashboard
  supports HMAC-signed payloads (common for mobile money gateways),
  that should replace the static shared-secret check in §1 — strictly
  stronger, same "fail closed when unconfigured" posture should be kept.
- **Replay-window / nonce check — implemented in Phase 2.** A captured,
  valid webhook payload replayed later used to still pass the
  shared-secret/HMAC check (the secret alone doesn't bind the payload to
  a single delivery) - mitigated only indirectly by the idempotency
  check described above. `utils/webhookReplayGuard.js` now adds two
  explicit, independent guards on top of that idempotency check: a
  timestamp-freshness window (5 minutes) where a provider supplies its
  own timestamp (MalipoPay does), and a SHA-256(provider + raw payload)
  dedup against the `webhook_replay_guard` table (migration 072) that
  works regardless of whether a timestamp/nonce field exists at all —
  see `PHASE2_SECURITY_CHANGELOG.md`.
- **No IP allowlisting.** Neither shared-secret nor HMAC verification is
  paired with restricting the source IP to the provider's published
  webhook IP ranges (where providers publish one). This would be
  defense-in-depth on top of the existing checks, not a replacement.
