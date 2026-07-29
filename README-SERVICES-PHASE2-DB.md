# Nexora Services — Phase 2 (Booking Infrastructure): DB layer

Follows Phase 1 (Foundation). This is **DB only** — backend, frontend,
and UI/UX follow as their own zips, same pattern as Phase 1.

## What this adds

One new migration: `database/migrations/063_services_booking_infrastructure.sql`.
Covers exactly the three items CHANGES.md's own roadmap lists under
Phase 2 (Availability Engine, Booking Engine, Booking Lifecycle). Full
reasoning is in the migration's own header comment; short version:

1. **`service_availability`** — one row per service per date:
   `available_units`, an optional `price` override (`NULL` = use the
   service's `base_price`), and `open`/`closed` `status`. Straight from
   CHANGES.md's own Availability entity.
2. **`bookings`** — the services equivalent of `orders`: a
   `booking_reference` (like `order_number`), the same plain
   `unpaid`/`paid` `payment_status` orders already use, and a `status`
   column that follows CHANGES.md's Booking Lifecycle **verbatim**
   (`pending → confirmed → active → completed`, with
   `cancelled`/`refunded` as exits) rather than reusing orders'
   shipping-oriented status enum.
3. **`booking_items`** — one row per date inside a booking's
   `[start_date, end_date)` range. This is the one place I had to make a
   real design call: CHANGES.md's Booking entity already carries
   `serviceId`/`quantity` directly, so `booking_items` isn't "cart line
   items" the way `order_items` is. What it captures instead is
   CHANGES.md's own availability example — a hotel needs its "20 rooms
   available" checked and decremented **per night**, not once per
   booking — so a 3-night stay gets 3 `booking_items` rows, each
   checked against `service_availability` independently. A single-date
   booking (a tour, a meeting room for a day) gets exactly one row.

`provider_payouts` — the fourth table CHANGES.md's "Database Tables"
list mentions — is deliberately **not** in this migration. Escrow/payout
wiring is Phase 3 (Financial Integration) on CHANGES.md's own roadmap,
same split Phase 1 already established for this table.

## Foreign key design (worth flagging explicitly)

`bookings.service_id` and `.provider_id` have **no** `ON DELETE
CASCADE` — same reasoning `004_create_products.sql` already documents
for `order_items.product_id`: hard-deleting the parent would orphan
booking/payment history. Neither `services` nor `seller_profiles` are
ever hard-deleted in this codebase anyway (soft-delete via
`is_active`/`status` only), so this just carries that same guarantee
forward. `booking_items.booking_id` **does** cascade, same as
`order_items.order_id` — line items only ever make sense attached to
their parent.

## Verification done in this sandbox

- Read through `004_create_products.sql`, `006_create_orders.sql`, and
  `054_escrow_foundation.sql` before writing this, specifically to keep
  the FK-cascade and `payment_status` conventions consistent with how
  orders already work
- No live MySQL available here, so the migration hasn't been executed —
  same caveat as every other migration delivered in this project

## Files in this zip

```
database/migrations/063_services_booking_infrastructure.sql   (new)
docs/DATABASE.md                                                (updated)
```

## To apply

```bash
cd database
npm run migrate
npm run migrate:status
```

## Next: Backend

`availability` and `booking` modules (repository/service/controller/
validator/routes, same shape as `service`/`serviceCategory`): provider
endpoints to set/bulk-set availability by date range, a public
availability-check endpoint the buyer-side date picker will call before
booking, and the actual booking-creation flow (check availability for
every date in range → decrement `available_units` → insert `bookings` +
`booking_items`, all inside a transaction). Payment/escrow integration
for bookings stays out of scope until Phase 3, so a created booking will
sit at `pending`/`unpaid` until that phase wires payment in — same
"functional but honestly incomplete" approach `ServiceDetail.jsx`'s
"Booking opens soon" notice already took in Phase 1.
