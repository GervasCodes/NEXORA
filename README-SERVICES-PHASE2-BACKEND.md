# Nexora Services — Phase 2 (Booking Infrastructure): Backend layer

Follows the Phase 2 DB layer. This zip is **backend only**. Frontend and
UI/UX for Phase 2 follow as their own zips.

## What this adds

Two new modules, following the exact repository/service/controller/
validator/routes shape every module in this codebase already uses.

### `modules/availability/`

Provider-facing calendar management + the public date-picker read.

- `PUT /services/:serviceId/availability` — provider sets
  `available_units`/`price`/`status` across a **date range** in one
  call (not one date at a time) — CHANGES.md's Provider Dashboard groups
  Calendar/Inventory/Pricing as one "Availability Management" unit, and
  a real calendar UI will call this once per range selection.
- `GET /services/:serviceId/availability` — public. A date with no
  availability row at all comes back as unavailable, not "open with
  unlimited units" — a provider has to deliberately open a date before
  it's bookable, the same way a product needs `stock > 0` before it can
  be ordered. Effective price per date resolves to the override if one
  exists, otherwise the service's discount/base price.

### `modules/booking/`

The actual booking-creation flow, plus the buyer/provider views and
lifecycle transitions.

- **`POST /bookings`** — the core piece. Validates the service is
  bookable, works out which calendar dates the booking actually
  occupies (pricing-model-aware — see below), prices each date against
  `service_availability`, then creates the booking transactionally:
  insert `bookings`, and for every date, a guarded
  `UPDATE ... WHERE available_units >= quantity` decrement (same
  pattern `order.repository.js` already uses for product stock) plus
  its `booking_items` row. Any date failing its guard rolls back the
  whole booking — no date can partially succeed.
- **Pricing-model-aware date range** — this needed a real decision
  CHANGES.md doesn't spell out: `per_night` bookings exclude the
  checkout day (a hotel stay from the 1st to the 4th is 3 nights, not
  4), while `per_day`/`per_hour`/`per_person`/`fixed` bookings include
  every day from start to end (a car rental returned on day 5 still had
  the car for day 5). All non-`per_night` models also accept
  `start_date === end_date` for the common single-day case (a tour, a
  meeting room for a day).
- `GET /bookings/mine` / `GET /bookings/provider/mine` — buyer's own
  bookings vs. a provider's bookings on their services.
- `GET /bookings/:id` — accessible by either party on the booking (the
  service layer checks which, not a role check at the route level).
- `PUT /bookings/:id/confirm` — provider only, `pending → confirmed`.
- `PUT /bookings/:id/cancel` — either party, only while
  `pending`/`confirmed`; restores the availability it had decremented.
- Booking created/confirmed/cancelled all raise a notification through
  the existing `notificationService.notify()` — reusing that
  infrastructure per CHANGES.md's own "reuse existing infrastructure"
  principle, same as escrow/wallet will be reused (not built new) in
  Phase 3. Uses plain English title/message rather than i18n keys for
  now (the same documented fallback path every other call site not yet
  migrated to keys uses) — full Swahili translation of these three
  strings is a small follow-up, not blocking.

**Payment is out of scope here on purpose.** A created booking sits at
`status: pending, payment_status: unpaid` — Phase 3 (Financial
Integration) is where escrow/payment actually gets wired in, per
CHANGES.md's own roadmap. Same "functional but honestly incomplete"
approach the frontend already took with Phase 1's "Booking opens soon"
notice.

### Routing note (worth flagging)

`availability.routes.js` is mounted at the same `/api/v1/services` base
as `service.routes.js`, not nested under a `/:serviceId/` prefix path —
its own routes carry the full `/:serviceId/availability` pattern. Two
routers can share a mount prefix like this safely as long as their route
*shapes* don't collide (Express matches by segment count/literal text,
not just prefix), which was checked here: none of `service.routes.js`'s
existing 1- or 2-segment routes end in a literal `availability` segment.

## Verification done in this sandbox

- `node --check` passed on every new/modified file
- `eslint` passed clean on every new/modified file, backend-wide
- **Not done**: no live MySQL to actually exercise the transaction /
  confirm the guarded decrement behaves correctly under real concurrent
  load — the logic mirrors `order.repository.js`'s battle-tested stock
  decrement closely, but please test a real booking flow (including a
  deliberate oversell attempt) against your dev DB before relying on it.

## Files in this zip

```
backend/src/app.js                                     (updated)
backend/src/modules/availability/*.js                  (new, 5 files)
backend/src/modules/booking/*.js                        (new, 5 files)
docs/API.md                                              (updated)
```

## Next: Frontend

Buyer-side: a date picker on `ServiceDetail.jsx` reading
`GET /services/:id/availability`, replacing the current "Booking opens
soon" notice with an actual `POST /bookings` flow, plus a bookings list
page. Provider-side: a calendar UI in the seller dashboard calling
`PUT /services/:id/availability`, and a bookings management page
(confirm/cancel) alongside the existing Services tab.
