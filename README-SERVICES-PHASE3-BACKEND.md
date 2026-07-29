# Nexora Services — Phase 3 (Financial Integration): Backend layer

Follows the Phase 3 DB layer (`README-SERVICES-PHASE3-DB.md`). This zip
is **backend only**. Frontend and UI/UX for Phase 3 follow as their own
zip.

## What this adds

No new modules — every change extends an existing module, per
CHANGES.md's own "Reuse existing infrastructure" requirement. All 15
changed files plus 1 new job file, by concern:

### Booking payments (`modules/payment/`)

New siblings of the existing verification-fee functions in
`payment.service.js` (not the order-payment functions — see migration
064's design notes for why):

- `initiateMobileMoneyBookingPayment` / `initiateSnippeBookingPayment` /
  `initiatePaypalBookingPayment` — one per gateway, mirroring the
  order-payment functions' shape exactly.
- `handleProviderWebhook`'s reference regex now also matches
  `BOOKING-<id>` alongside the existing `ORDER-<id>` / `VERIFY-<id>`,
  routing to a new `_handleBookingPaymentWebhook`. Much simpler than the
  order equivalent: a booking has exactly one provider (no parent/child
  order split to propagate `payment_status` across), and always goes
  through escrow (no Cash-on-Delivery-shaped path for a service).
- `capturePaypalPayment`'s reference fallback now also recognizes
  `purpose === 'booking_payment'`.
- `getBookingPayment(bookingId, userId)` — either party on the booking.
- `refundBookingPayment(bookingId, amount)` — a best-effort online
  refund for a cancelled, already-paid booking. Reuses the exact same
  provider refund APIs `refund.service.js`'s `callProvider` already
  wraps, called directly (no dispute row, no retry/audit-log/refunds-
  table machinery — that infrastructure is genuinely dispute-shaped, and
  there's no dispute system for bookings yet). Mobile money refunds are
  flagged `requiresManualHandling: true` since a booking never persists
  the buyer's phone number past the moment they paid.

New routes in `payment.routes.js`, under a literal `/booking/` prefix
(registered before the same-shaped `/:orderId/...` routes, same ordering
rule the verification-fee/paypal routes already document):
`POST /booking/:bookingId/initiate`,
`POST /booking/:bookingId/snippe/checkout`,
`POST /booking/:bookingId/paypal/create`, `GET /booking/:bookingId`.

### Escrow + commission (`modules/wallet/`)

- `creditProvidersForBooking(bookingId)` — the booking equivalent of
  `creditSellersForOrder`. Called from the booking-payment webhook
  handler. Simpler than the order version: a booking never splits across
  multiple providers, so there's no per-seller grouping map, and every
  booking payment is escrowed (no COD branch).
- `releaseEligibleBookingEarnings()` / `releaseBookingEarnings(bookingId)`
  — the scheduled-job and admin-manual-release equivalents of
  `releaseEligibleEarnings` / `releaseOrderEarnings`. No dispute-freeze
  branch (there's no dispute system for bookings), so eligibility is
  purely: credited, not yet released, booking `status = 'completed'`,
  past `escrow_hold_days` (the same admin-tunable setting orders use).
- `reverseProviderEarningsForBooking(providerId, amount, bookingId)` —
  the booking equivalent of `dispute.service.js`'s private
  `reverseSellerEarnings`, exported here since a booking cancellation has
  no dispute row to hang the reversal off of. Same held-then-balance
  reversal order.

### Booking lifecycle + cancellation refund (`modules/booking/`)

- `booking.repository.js`: `updatePaymentStatus`, plus the date-driven
  lifecycle sweep `activateStartedBookings` / `completeFinishedBookings`
  / `findBookingsCompletingToday`, and `cancelBooking` now accepts a
  `finalStatus` ('cancelled' or 'refunded').
- `booking.service.js#cancelBooking`: if the booking was already paid,
  this now reverses the provider's escrowed earnings
  (`walletService.reverseProviderEarningsForBooking`) and attempts an
  online refund (`paymentService.refundBookingPayment`), landing the
  booking on `'refunded'` instead of `'cancelled'` — CHANGES.md's own
  Booking Lifecycle lists REFUNDED as its own exit state for exactly
  this case. A failed/manual-required refund still leaves the booking
  marked refunded and the earnings reversed (logged for follow-up) —
  the alternative of leaving it "confirmed" would be worse, since it'd
  keep counting toward the provider's availability and escrow as if
  nothing happened.

### Lifecycle automation (`jobs/`)

- **New**: `jobs/bookingLifecycle.job.js` — advances paid bookings
  through `confirmed → active → completed` as their dates pass, with no
  user action required (a hotel stay "completes" the day the guest
  checks out, regardless of whether anyone clicks anything). Only
  *paid* bookings auto-advance. Runs hourly at :10, raising the "Booking
  Completed" notification from CHANGES.md's own Notifications list.
- `jobs/escrowRelease.job.js` — now also calls
  `releaseEligibleBookingEarnings()` from the same hourly tick (:15,
  after `bookingLifecycle` so a booking completing this hour is already
  `'completed'` by the time the release scan runs).
- `jobs/index.js` — registers `bookingLifecycle` on the schedule above.

### Admin (`modules/admin/`)

- `PUT /admin/bookings/:id/release-escrow` — the booking equivalent of
  the existing `PUT /admin/orders/:id/release-escrow` manual early-
  release lever (`admin.service.js#releaseBookingEscrow` →
  `walletService.releaseBookingEarnings`).

### Docs

- `docs/API.md` — Bookings and Payments sections updated with the new
  endpoints, the automatic lifecycle-transition note, and the escrow/
  commission reuse explanation.

## What this deliberately reused instead of building new

- **Payouts**: zero new code. `GET /wallet`, `POST /wallet/withdrawals`
  already work for a provider exactly as they do for a product seller —
  same `seller_wallets` row, same `users.id`.
- **Commission Management**: zero new code.
  `settingsService.getCommissionRate()` / `getEscrowHoldDays()` are
  called as-is; the existing `PUT /admin/settings` endpoint already
  lets an admin change the platform-wide rate, and it now applies to
  booking earnings too, automatically.

## Verification done in this sandbox

- `node --check` passed on every new/modified backend file (full sweep
  of `backend/src/**/*.js`, not just the touched files).
- Traced every new `require()` for circular-dependency risk by hand
  (`booking.service.js` → `payment.service.js` → `booking.repository.js`
  only, no cycle back to `booking.service.js`).
- **Not done**: no live MySQL or payment-gateway sandbox to exercise a
  real booking-payment → webhook → escrow-credit → cancellation-refund
  round trip, or the cron jobs against real data. `eslint`/`npm test`
  also weren't runnable in this sandbox (no network access to install
  tooling). Please run the full test suite and a manual booking-payment
  flow (including a deliberate cancellation-after-payment) against your
  dev environment before relying on this in production.

## Files in this zip

```
backend/src/jobs/bookingLifecycle.job.js                (new)
backend/src/jobs/escrowRelease.job.js                    (updated)
backend/src/jobs/index.js                                 (updated)
backend/src/modules/admin/admin.controller.js             (updated)
backend/src/modules/admin/admin.routes.js                 (updated)
backend/src/modules/admin/admin.service.js                (updated)
backend/src/modules/admin/admin.validator.js              (updated)
backend/src/modules/booking/booking.repository.js         (updated)
backend/src/modules/booking/booking.service.js            (updated)
backend/src/modules/payment/payment.controller.js         (updated)
backend/src/modules/payment/payment.repository.js         (updated)
backend/src/modules/payment/payment.routes.js              (updated)
backend/src/modules/payment/payment.service.js             (updated)
backend/src/modules/payment/payment.validator.js           (updated)
backend/src/modules/wallet/wallet.repository.js            (updated)
backend/src/modules/wallet/wallet.service.js               (updated)
docs/API.md                                                 (updated)
README-SERVICES-PHASE3-BACKEND.md                           (new, this file)
```

## Next: Frontend + UI/UX

Buyer-side booking payment UI (pay by mobile money/Snippe/PayPal on the
booking detail page) and the wallet copy update for provider-side
escrow. Phase 4 (Customer Experience) is next on CHANGES.md's own
roadmap after that.
