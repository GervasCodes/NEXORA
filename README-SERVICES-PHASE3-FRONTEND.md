# Nexora Services — Phase 3 (Financial Integration): Frontend + UI/UX

Follows the Phase 3 backend layer (`README-SERVICES-PHASE3-BACKEND.md`).
This is the buyer- and provider-facing UI that turns the booking-payment
and escrow APIs into an actual "pay for your booking" flow, replacing the
Phase 2 "payment isn't collected yet" notice.

## What this adds

### `pages/BookingDetail.jsx`

The core of this zip. A new payment section appears whenever the signed-
in user is the customer (not the provider) and the booking is unpaid and
not cancelled/refunded:

- A phone-number field + **Pay with Mobile Money** button
  (`POST /payments/booking/:id/initiate`) — bookings don't persist a
  phone column the way orders do (see migration 064's design notes), so
  the buyer enters it right there, mirroring `initiateVerificationFeePayment`'s
  own explicit-phone pattern on the backend.
- **Pay with Card (Snippe)** and **Pay with PayPal** buttons, redirecting
  out and back to `?payment=success` / `?payment=paypal_return` /
  `?payment=cancelled` on this same page — byte-for-byte the same
  redirect-handling shape `OrderDetail.jsx` already uses (including the
  6-attempt, 3-second polling fallback for the case where the
  `payment:updated` socket event doesn't arrive before the buyer lands
  back on the page).
- A live `payment:updated` socket listener, keyed on `payload.bookingId`
  (the field the backend's `_handleBookingPaymentWebhook` emits) rather
  than `orderId`.
- `handleCancel` now reads the cancel response's `refunded` flag (Phase 3
  backend returns `{ cancelled, refunded, refundOutcome }`) and shows a
  distinct "cancelled and refunded" message when the booking had already
  been paid for.

### `context/LanguageContext.jsx`

Sixteen new `booking.payment.*` keys (English + Swahili) for the payment
section above, plus `booking.cancelledRefundedMessage`. The Phase 2
`booking.widget.paymentNote` copy on the service page's booking widget
("Payment isn't collected yet…") is updated to reflect that payment now
happens on the very next screen, in both languages.

### `pages/seller/SellerWallet.jsx`

One copy fix: the "held balance" explainer said "Held until the order is
delivered…", which is now inaccurate — the same wallet page already
shows a provider's booking earnings (the description text on each
transaction row, e.g. "Booking earnings for booking #15 held pending
release…", already comes through generically from `GET /wallet` with no
frontend change needed). Updated to "Held until the order is delivered
(or the booking is completed)…".

## What this deliberately left as-is

- **No new provider payout UI.** `SellerWallet.jsx` already lists every
  transaction (order or booking) and every withdrawal request
  identically — a provider's booking earnings show up in the exact same
  balance/held-balance/transaction-history/withdrawal-request UI a
  product seller already uses, with zero frontend changes required
  beyond the one copy fix above.
- **No new admin bookings-management page.** The backend's
  `PUT /admin/bookings/:id/release-escrow` (mirroring the existing
  `AdminOrders.jsx` release-escrow button) has no frontend counterpart
  in this zip — building a full admin bookings list/detail view is a
  larger UI surface than Phase 3's Financial Integration scope
  (Escrow/Payouts/Commission) calls for on its own, and fits more
  naturally alongside Phase 5's Advanced Reporting. The endpoint is
  live and callable in the meantime.
- **No changes to `ServiceDetail.jsx`'s booking-creation flow itself**
  beyond the one copy string — a booking is still created unpaid, then
  paid for on `BookingDetail.jsx`, exactly as Phase 2 already routes it
  (`navigate('/bookings/:id', { state: { justBooked: true } })`).

## Verification done in this sandbox

- Manual brace/paren balance check and a full line-by-line diff review
  of all three changed files (shown below) — every added string is
  syntactically closed, every JSX block is balanced.
- Traced every new hook dependency (`useSocket`, `useNavigate`) against
  what's already imported/used identically in `OrderDetail.jsx`.
- **Not run in this sandbox**: `npm run build` / `npm run lint` /
  `npm test` — no network access to install `eslint`/`vite` binaries in
  this environment (`node_modules` present but incomplete). Please run
  the full build/lint/test suite against your dev environment before
  relying on this in production, the same caveat Phase 2's frontend
  README already flagged for its own sandbox limits.

## Files in this zip

```
frontend/src/context/LanguageContext.jsx        (updated)
frontend/src/pages/BookingDetail.jsx             (updated)
frontend/src/pages/seller/SellerWallet.jsx        (updated)
README-SERVICES-PHASE3-FRONTEND.md                (new, this file)
```

## Next: Phase 4 (Customer Experience)

Phase 3's roadmap items (Escrow Integration, Payouts, Commission
Management) are now functionally complete end-to-end: a buyer can pay
for a booking through any of the three existing gateways, the provider's
earnings are held in escrow and automatically release after the hold
window, and a cancelled paid booking is refunded and reversed. Left for
a dedicated UI/UX polish pass: an admin bookings dashboard, and full
Swahili translation of the payment-status toast copy inside
`pollForPaymentConfirmation`'s dynamically-built strings (currently
covered by the same key-based `t()` calls as the rest of the page, so
this is already localized — noted here only because it's worth a manual
read-through in Swahili before shipping). Phase 4 (Customer Experience —
Reviews, Notifications, Search & Filters) is next on CHANGES.md's own
roadmap.
