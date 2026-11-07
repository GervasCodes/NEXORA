# Phase 5 - Thank-you page (Workstream B)

Frontend only. Unzip over the repository root (paths start with NEXORA/).

## Files added (4)
- frontend/src/pages/OrderConfirmed.jsx (route /order-confirmed/:id)
- frontend/src/utils/orderConfirmation.js (pure state / purchase / items helpers)
- frontend/tests/pages/OrderConfirmed.test.jsx (11 tests)
- frontend/tests/utils/orderConfirmation.test.js (13 tests)

## Files modified (8)
- frontend/src/App.jsx (lazy import + RequireBuyer route)
- frontend/src/pages/Checkout.jsx (success redirects, see below)
- frontend/src/pages/OrderDetail.jsx (PayPal capture success -> confirmation page)
- frontend/src/utils/analytics.js (trackPurchase, hashTransactionId, /order-confirmed is a private path)
- frontend/src/i18n/en.js, frontend/src/i18n/sw.js (33 `orderConfirmed.*` keys each)
- frontend/tests/pages/Checkout.test.jsx (3 expectations updated)
- frontend/tests/utils/analytics.test.js (6 tests added)

## Files deleted
None.

## New env vars / migrations / dependencies
None. (Analytics still needs the existing VITE_GA_MEASUREMENT_ID.)

## How to test
    cd frontend
    npx vitest run tests/pages/OrderConfirmed.test.jsx tests/utils tests/pages/Checkout.test.jsx
    npx vitest run          # full suite
    npx eslint src/pages/OrderConfirmed.jsx src/utils src/pages/Checkout.jsx src/pages/OrderDetail.jsx src/App.jsx
    npx vite build

Manual (sandbox payments): place a wallet order, a cash-on-delivery order, a mobile-money order
(approve on the phone), a card order and a PayPal order. Expect the confirmation page each time;
mobile money/card show "confirming payment" first and flip to confirmed by themselves. Cancel on the
gateway page: you land on /orders/:id (unchanged). With GA configured and cookies accepted, check
GA DebugView for one `purchase` per order and no page_view for /order-confirmed.

## Behaviour
- Checkout success: wallet, cash on delivery and mobile money go to /order-confirmed/:id
  (replace, so Back does not return to checkout). Card/hosted checkout success URL is now
  /order-confirmed/:id?payment=success; the page itself waits for the provider webhook (poll every 3 s
  for ~2 min + live socket event). PayPal still returns to /orders/:id?payment=paypal_return, where the
  capture happens; on a successful capture it now moves on to the confirmation page.
- Payment failed or cancelled still goes to /orders/:id (unchanged); a cancelled order opened at the
  new URL is redirected there too; a failed live payment event also redirects there.
- Page: confirmation heading (or "confirming payment" state), order summary (items, total, payment,
  placed date, address or pickup point), "what happens next" (pickup / delivery / made-to-order / cash),
  Track order, View order details, Share (native share or copy link), Continue shopping. A multi-vendor
  order lists all vendor items and links to the order page instead of tracking. Focus moves to the
  heading; noindex; en/sw.
- GA `purchase`: only when GA is configured AND the visitor accepted cookies; once per order per
  browser; sent when the order is paid, deposit-paid (deposit amount), cash on delivery or wallet; never
  for an order older than 24 h opened later. Payload: hashed transaction_id, value, currency (TZS),
  payment_type. No items, names, address, phone or order number. Page views of the page are never sent.

## Decisions needed from you
1. COOKIE POLICY WORDING. frontend/src/legal/cookie-policy.md says we never send "order details"
   to Google. The purchase event sends the order value, payment type and a hashed order id. I kept it
   as small as GA allows and did not edit the legal text. Either approve updating the wording (I can
   draft it, en/sw) or tell me to drop value/payment type.
2. Currency: value is sent in TZS (the stored order currency), not the buyer's display currency.
3. A pre-order's later balance payment does not fire a second purchase (one event per order);
   revenue in GA for pre-orders is the deposit only.

## Notes and limits
- Not verified in a real browser or in real GA (no GA id or browser here); the event is tested against
  window.dataLayer only. Mobile layout of the new page is unchecked visually (Phase 8 QA checklist).
- The old "Order placed" banner in OrderDetail.jsx (location.state.justPlaced) is no longer triggered by
  checkout. Left in place, untouched; can be removed in a cleanup.
- No automated test covers OrderDetail's PayPal return (no OrderDetail test file exists); that branch
  is a small change but needs the manual PayPal test above.
- Swahili text was written by AI; the Swahili next-step text quotes the English button names
  "Confirm Receipt" / "Report a problem" because OrderDetail's buttons are still English-only.
- Backend untouched: the redirect check only validates the origin, so the new success URL path is accepted.

## Test results
- New and changed files: 4 test files, 48 tests pass.
- Full frontend suite: 92 files, 587 tests pass. eslint on all touched source/test files: clean.
  JSX-literal check: no hits for the new page. vite build: succeeds.
- Backend not run (no backend change).
