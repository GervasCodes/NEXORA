# Webhook Validation

Phase 3 (External Review Readiness) deliverable. Documents exactly how
NEXORA authenticates each inbound payment-provider webhook today, so an
external reviewer can verify the claim "we don't trust unauthenticated
webhook payloads" against the actual code rather than take it on faith.

All webhook endpoints are mounted under `/api/v1/payments/webhooks/*`
(see `backend/src/modules/payment/payment.routes.js` and the one
route registered directly in `backend/src/app.js` for Snippe — see §2).

## 1. MalipoPay & Selcom — provider-specific verification (updated Phase 7)

**Endpoints:** `POST /payments/webhooks/malipopay`,
`POST /payments/webhooks/selcom`
**Middleware:** `backend/src/middleware/webhookAuth.middleware.js`
(`verifyMalipopayWebhook` / `verifySelcomWebhook`)

> **This section previously described a generic `X-Webhook-Secret`
> header check as the current mechanism for both providers. That's now
> out of date** — as of this repo's Phase 2 (Security Hardening) work,
> each provider is verified with its own real documented mechanism
> instead (confirmed against developers.malipopay.co.tz and
> developers.selcommobile.com on 2026-08-02, re-checked as part of
> Phase 7). The old generic check still exists as
> `exports.verifySharedSecretHeader` in
> `webhookAuth.middleware.js` — kept as a portable fallback, not wired
> to any route by default — see that file's own header comment for when
> to use it instead.

### MalipoPay — per-request payload signature

Per developers.malipopay.co.tz/integration/webhooks, every callback body
includes a `payloadSignature` field:

```
payloadSignature = SHA256(reference + timestamp + amount + phoneNumber + secret)
```

where `secret` is the same `MOBILE_MONEY_API_KEY` used as the `apiToken`
header on outbound requests (MalipoPay uses one project key, not a
separate secret/key pair — see `malipopay.provider.js`'s header comment).

**Validation logic** (`verifyMalipopayWebhook`):

1. If `MOBILE_MONEY_API_KEY` is **not set**: reject in production (fail
   closed), allow through outside production (same reasoning as the old
   shared-secret check — local/dev testing with a hand-crafted payload
   shouldn't require a secret).
2. Reject if `payloadSignature` or `customer.phoneNumber` is missing.
3. Recompute the SHA256 above and compare with `crypto.timingSafeEqual`
   (constant-time — see §5's reasoning, same pattern as Snippe's HMAC
   check).
4. Reject if the payload's `timestamp` isn't fresh (see the replay-guard
   paragraph under §6 — unchanged from before).
5. Reject if this exact delivery has already been recorded (dedup).

### Selcom — static Bearer token

Per developers.selcommobile.com's C2B/Collection Services section, the
Payment Notification callback (the `transid`/`resultcode`/`result` shape
`selcomWebhook` reads) authenticates with a static bearer token Selcom's
team shares directly, not a per-request signature:

```
Authorization: Bearer <SELCOM_WEBHOOK_SECRET>
```

**Validation logic** (`verifySelcomWebhook`): same fail-closed-in-
production / constant-time-compare / replay-dedup shape as MalipoPay
above, just comparing the bearer token instead of recomputing a
signature. Selcom's documented payload carries no timestamp/nonce of its
own, so the replay-hash dedup is this provider's only guard against a
captured, validly-authenticated request being replayed later (see §6).

### Payload shape checked, not just authenticated (Phase 7 addition)

Signature/token verification above proves a request came from the
provider; it doesn't prove `payload.reference` (MalipoPay) or
`payload.transid` (Selcom) is the well-formed string
`handleProviderWebhook`'s `ORDER-`/`VERIFY-`/`BOOKING-`/`SUB-` regex
match expects. `payment.controller.js`'s `malipopayWebhook` /
`selcomWebhook` handlers now reject (`200 { success: false }`, logged at
`warn`) before calling into `payment.service.js` if that field is
missing or isn't a string, instead of letting a malformed-but-
authenticated payload surface as an unhandled-exception `error` log.
Sample payloads matching the shape validated above (and used by
`backend/tests/integration/payment.webhooks.test.js`) are collected in
`backend/tests/fixtures/webhookPayloads.js`.

**Why provider-specific mechanisms and not a generic shared secret:**
strictly stronger — a per-request signature (MalipoPay) or non-guessable
bearer token (Selcom) authenticates the specific provider's actual
integration rather than a header either provider may or may not
actually support. The previous generic `X-Webhook-Secret` check is kept
only as a fallback for a provider whose real sandbox behavior turns out
to differ from its public docs.

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

- **MalipoPay/Selcom payload shapes still aren't confirmed against live
  sandbox access** (Phase 7 re-checked this — full webhook-payload docs
  for both providers sit behind a business/merchant login neither
  developers.malipopay.co.tz nor developers.selcommobile.com expose
  publicly). The field names read in `payment.controller.js`
  (`payload.reference`, `payload.status`, `payload.payloadSignature`,
  `payload.transid`, `payload.resultcode`, `payload.result`) and the
  signature/token mechanisms in §1 follow each provider's publicly
  documented pattern and are exercised by real tests
  (`backend/tests/integration/payment.webhooks.test.js`,
  `backend/tests/unit/webhookAuth.middleware.test.js`), but that's still
  not the same as a confirmed live-sandbox round trip. **Do one manual
  sandbox test per provider before go-live** — this is the single
  highest-value verification step left, and the one this repo cannot do
  without provider account access.
- **Shared-secret vs. per-provider mechanism — resolved for MalipoPay
  and Selcom in §1**, superseding the "if either provider supports
  HMAC..." note this section used to carry. The generic
  `verifySharedSecretHeader` fallback (§1) remains available if a
  provider's real sandbox behavior ever turns out to differ from its
  public docs.
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
