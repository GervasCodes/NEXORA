# Seller Subscription Plans (Phase 3a)

Part of the Revenue & Product Enhancements roadmap. Lets sellers pay for
a tiered plan that lowers their platform commission rate and raises their
active-listing cap, instead of every seller paying the platform default.

## Data model

- **`subscription_plans`** - admin-managed catalog. Seeded with four tiers
  (Free / Starter / Growth / Pro). Each plan has:
  - `commission_rate_override` - `NULL` means "use the platform default
    `commission_rate` setting" (Settings page); a number overrides it.
  - `max_active_listings` - `NULL` means unlimited; otherwise caps a
    seller's combined active products + services.
- **`seller_subscriptions`** - one row per subscription period (append-only,
  same pattern as `wallet_transactions`). A seller's "current" plan is
  resolved as the most recent `status = 'active'` row whose
  `current_period_end` hasn't passed; upgrading/downgrading closes the old
  active row rather than mutating it.
- **`payments`** gained a nullable `subscription_id` column and a fourth
  `purpose` value, `subscription_payment` - the exact same shape as the
  existing `seller_verification_fee` and `booking_payment` purposes.

Migrations: `073_seller_subscription_plans.sql`, and the `payments` table
change is part of the same file (mirrors how 064 extended `payments` for
bookings).

## Payment flow

Subscription checkout reuses the platform's existing payment provider
abstraction (mobile money / Snippe / PayPal) exactly the way seller
verification fees already do - `payment.service.js` gained
`initiateMobileMoneySubscriptionPayment`, `initiateSnippeSubscriptionPayment`,
and `initiatePaypalSubscriptionPayment`, siblings of the `*VerificationFeePayment`
functions. A payment references its subscription via a `SUB-<id>` provider
reference, and `handleProviderWebhook`'s existing regex-routing gained one
more pattern to dispatch it to `_handleSubscriptionPaymentWebhook`, which
marks the payment complete and calls
`subscriptionService.activateSubscription()`.

No new webhook endpoints were added - subscriptions ride the same
`/payments/webhook/*` endpoints already wired up for orders/verification/
bookings.

## Where the plan actually takes effect

Two integration points, both additive (a seller with no subscription
behaves exactly as before this phase):

1. **Commission rate** - `wallet.service.js`'s `creditSellersForOrder` and
   `creditProvidersForBooking` used to call
   `settingsService.getCommissionRate()` once per order/booking. They now
   call `subscriptionService.getEffectiveCommissionRate(sellerId)` **per
   seller** (a multi-vendor order can mix sellers on different plans),
   which itself falls back to the platform default for anyone without an
   active override. The rate actually applied is still snapshotted onto
   `order_items`/`booking_items` exactly as before - a later plan change
   never rewrites a past sale's commission.
2. **Listing limits** - `product.service.js#createProduct` and
   `service.service.js#createService` now call
   `subscriptionService.canCreateListing(sellerId)` before creating a new
   listing, and reject with a 403 if the seller is at their plan's cap.
   Editing/deactivating existing listings is unaffected.

## Endpoints

Seller (`/api/v1/subscriptions`):
- `GET /plans` - public, active plans only
- `GET /me` - seller's current plan + active listing count
- `POST /subscribe` `{ planCode, phone }` - mobile money
- `POST /subscribe/snippe` / `POST /subscribe/paypal` - redirect checkout
- `POST /cancel` - turns off auto-renew (plan stays active until period end)

Admin (`/api/v1/admin`):
- `GET /subscription-plans`, `POST /subscription-plans`,
  `PUT /subscription-plans/:id` - plan CRUD (price, commission override,
  listing cap, active flag)
- `GET /subscriptions` - all seller subscription records

## Frontend

- Seller: `/seller/subscription` - plan cards, checkout (mirrors
  `VerificationFeeGate.jsx`'s mobile-money polling + redirect-return
  handling), current plan summary, cancel auto-renew.
- Admin: `/admin/subscriptions` - inline-editable plan table + subscriber
  list.

## What's deliberately out of scope for this sub-phase

- No automated renewal job - `auto_renew=false` just stops a plan from
  being treated as renewable; nothing currently flips an expired period's
  status from `active` to `expired` automatically. That's a scheduled-job
  concern, and Phase 4 of this roadmap (Engineering & Scalability) is where
  scheduled jobs are being moved to dedicated worker processes - a
  subscription-renewal/expiry job belongs there rather than being bolted
  onto this phase.
- No proration for mid-cycle upgrades/downgrades - switching plans starts
  a fresh full-price period.
