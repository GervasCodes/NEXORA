# Refund Automation (Phase 2)

## What it does

When an admin resolves a dispute with resolution `refund_full` or
`refund_partial` (`PUT /admin/disputes/:id/resolve` →
`dispute.service.js` `resolveDispute()`), the platform now automatically
pushes the refund back to the buyer through whichever payment provider
the original order used, instead of only recording the refund amount on
the dispute for a human to action later.

```
dispute.service.js resolveDispute()
        │
        ├─ marks the dispute resolved, debits the seller's wallet
        │  (existing behavior, unchanged)
        │
        └─ refund.service.js autoRefundForDispute()  [fire-and-forget]
                │
                ├─ finds the completed payment for the order
                ├─ creates (or reuses) one `refunds` row for this dispute
                ├─ dispatches to the right provider:
                │     mobile_money → malipopay/selcom .refund()
                │     snippe       → snippe.provider.js refundPayment()
                │     paypal       → paypal.provider.js refundCapture()
                │     cash_on_delivery → no online path, manual_required
                └─ retries up to 3 times on failure/thrown error,
                   then leaves the row 'failed' for an admin to retry
```

## Idempotency

`refunds.dispute_id` is `UNIQUE` (migration `038_refunds.sql`). A dispute
can only ever have one refund row. If `autoRefundForDispute` is somehow
invoked twice for the same dispute (double-click, retried admin request,
a process restart re-processing an event), the second call finds the
existing row and returns its current status instead of refunding the
buyer twice — this is enforced at the database layer via the unique
constraint, not just in application logic, so it holds even under a race
between two concurrent requests.

## Retries & failure handling

Each automatic attempt series runs up to **3 attempts** with a short
backoff (1s, then 3s) between them, inside the one
`autoRefundForDispute()` call. A thrown error (network failure,
misconfigured credentials) and an explicit `{ success: false }` response
from a provider are both treated as a failed attempt and retried the
same way.

If all 3 attempts fail, the refund row is left in `failed` status with
`last_error` set to the last provider error. Cash on delivery payments
skip straight to `manual_required` since there's no online reversal
possible for a payment that was never processed electronically.

## Admin triage

- `GET /admin/refunds` — lists refunds needing attention by default
  (`failed`, `manual_required`, `processing`); pass `?status=completed`
  etc. to see others.
- `GET /admin/refunds/:id` — a single refund's full record.
- `POST /admin/refunds/:id/retry` — manually retries a `failed` refund
  (e.g. after fixing a provider credential or confirming the buyer's
  mobile money wallet is reachable again). Refuses if the refund is
  already `completed` or `processing`.

## Audit logging

Every step is logged via `audit.service.js` (`audit_logs` table, added
in migration 035) under event types `refund.triggered`,
`refund.completed`, `refund.failed`, `refund.manual_required`,
`refund.duplicate_trigger_skipped`, and `refund.manual_retry` — visible
at the existing `GET /admin/audit-logs` endpoint.

## Provider coverage & caveats

| Provider | Refund mechanism | Notes |
|---|---|---|
| Mobile money (MalipoPay / Selcom) | Payout (`disburse`-style call) back to the buyer's own phone number | Neither provider's public docs expose a dedicated "reverse this collection" endpoint distinct from a generic payout — confirm with your account rep whether one exists before high volume |
| Snippe | `POST /payments/{reference}/refund` | Follows the same "commonly documented shape, confirm against your real onboarding docs" caveat already called out for `snippe.provider.js`'s checkout session code — **not verified against a live Snippe account** in this change |
| PayPal | `POST /v2/payments/captures/{id}/refund` | This is PayPal's real, documented Payments v2 refund endpoint |
| Cash on delivery | None (by definition) | Always routed to `manual_required` |
| Stripe | Removed | `stripe.provider.js` was dead code (unreferenced by `payment.service.js`/`payment.controller.js`/`payment.routes.js`, no `stripe` npm dependency) and has been deleted as part of Phase 7's payment provider cleanup — `orders.payment_method` / `payments.method` haven't accepted `'stripe'` since migration 030 |

**Important:** this environment has no network access, so none of the
provider refund calls above could be exercised against a live sandbox.
The unit tests (`tests/unit/refund/refund.service.test.js`) mock every
provider call and verify the service's own logic (idempotency, retry
count, dispatch-by-method, error handling) — they do **not** prove the
Snippe/MalipoPay/Selcom request shapes match those providers' real APIs.
Verify each against a sandbox account before relying on this in
production, same as the existing checkout code these refund methods sit
next to.
