# Nexora Services — Phase 2 (Booking Infrastructure): Frontend layer

Follows the Phase 2 backend layer (`README-SERVICES-PHASE2-BACKEND.md`).
This is the buyer- and provider-facing UI that turns the availability and
booking APIs into an actual "Booking opens soon" → real booking flow, per
that README's own "Next: Frontend" section.

## What this adds

### Shared

- `components/AvailabilityCalendar.jsx` — a month-at-a-time calendar that
  reads `GET /services/:id/availability`. Presentational + data-fetching
  only: it doesn't know about bookings or providers, just renders a
  month's open/closed/past days and reports clicks back to whoever
  embeds it. Used in two different contexts below rather than being
  duplicated.

### Buyer-side

- `pages/ServiceDetail.jsx` — the Phase 1 "Booking opens soon" notice is
  replaced with a real `BookingWidget`. It uses `AvailabilityCalendar` in
  clickable mode: `per_night` services (hotels, etc.) take a check-in
  then a check-out click, everything else takes a single click. Pricing
  is estimated client-side from the calendar's per-date prices using the
  same "checkout day isn't charged" rule `booking.service.js#buildDateList`
  applies server-side, then `POST /bookings` does the real, authoritative
  pricing and availability check.
- `pages/Bookings.jsx` — a buyer's own bookings (`GET /bookings/mine`),
  same list/status-pill pattern `pages/Orders.jsx` already uses.
- `pages/BookingDetail.jsx` — booking detail (`GET /bookings/:id`).
  Shared between customer and provider (the API is: whichever side is on
  the booking can view it), so this one page renders for both and just
  varies which actions it offers - confirm is provider-only, cancel is
  either side while `pending`/`confirmed`.

### Provider-side (seller dashboard)

- `pages/seller/SellerAvailability.jsx` — picks one of the provider's own
  services, then bulk-sets `available_units`/`price`/`status` across a
  date range in one `PUT /services/:id/availability` call, per the
  backend's own "one call per range selection, not one date at a time"
  design. `AvailabilityCalendar` (read-only here) shows the result
  immediately after a save.
- `pages/seller/SellerBookings.jsx` — bookings on the provider's own
  services (`GET /bookings/provider/mine`), with confirm/cancel actions,
  matching `pages/seller/SellerOrders.jsx`'s list/action pattern.

Both provider pages gate on `profile.merchant_type` being `service` or
`hybrid` (same check `SellerServices.jsx` already uses) and point back to
the Services tab otherwise, rather than duplicating the merchant-type
switch UI.

### Navigation

- `SellerLayout.jsx` — new "Availability" and "Bookings" tabs alongside
  "Services".
- `Header.jsx` / `NavIcons.jsx` — new "Bookings" link for buyer accounts
  alongside "Orders", with its own calendar-with-checkmark icon
  (distinct from the plain-calendar Services icon).
- `App.jsx` — new routes: `/bookings` (buyer, `RequireBuyer`),
  `/bookings/:id` (either party, `RequireAuth` - the service layer
  enforces per-booking access same as `/disputes/:id` already does),
  `/seller/availability`, `/seller/bookings`.
- `LanguageContext.jsx` — `nav.bookings` added in English and Swahili.

## Payment is still out of scope (by design)

Same as the backend README states: a created booking sits at
`pending`/`unpaid`. Phase 3 (Financial Integration) is where payment
actually gets wired in - the booking widget says as much under the
"Book now" button, the same "functional but honestly incomplete" framing
Phase 1's own original notice used.

## Verification done in this sandbox

- `npm run build` (vite) - clean production build, no errors.
- `npm run lint` (eslint) - no new errors or warnings on any new/modified
  file; the 3 pre-existing `react-hooks/exhaustive-deps` warnings are on
  files this zip didn't touch.
- New vitest coverage for the riskiest new logic:
  `tests/components/AvailabilityCalendar.test.jsx`,
  `tests/pages/Bookings.test.jsx`, `tests/pages/BookingDetail.test.jsx`,
  `tests/pages/seller/SellerBookings.test.jsx`.
- **Not run in this sandbox**: the vitest suite itself (no live backend
  to exercise the real `POST /bookings` flow against) - please run
  `npm test` against your dev environment before relying on it.

## Files in this zip

```
frontend/src/components/AvailabilityCalendar.jsx        (new)
frontend/src/components/Header.jsx                       (updated)
frontend/src/components/NavIcons.jsx                     (updated)
frontend/src/components/SellerLayout.jsx                 (updated)
frontend/src/context/LanguageContext.jsx                 (updated)
frontend/src/pages/Bookings.jsx                          (new)
frontend/src/pages/BookingDetail.jsx                      (new)
frontend/src/pages/ServiceDetail.jsx                      (updated)
frontend/src/pages/seller/SellerAvailability.jsx          (new)
frontend/src/pages/seller/SellerBookings.jsx              (new)
frontend/src/App.jsx                                      (updated)
frontend/tests/components/AvailabilityCalendar.test.jsx  (new)
frontend/tests/pages/Bookings.test.jsx                    (new)
frontend/tests/pages/BookingDetail.test.jsx               (new)
frontend/tests/pages/seller/SellerBookings.test.jsx       (new)
README-SERVICES-PHASE2-FRONTEND.md                        (new, this file)
```

## Next: UI/UX polish + Phase 3

Functionally complete for Phase 2's roadmap items (Availability Engine,
Booking Engine, Booking Lifecycle). Left for the dedicated UI/UX pass:
richer calendar interactions (drag-select a range instead of two clicks,
inline nightly price editing per cell) and full Swahili translation of
the booking pages' body copy (currently plain English, same fallback
path other not-yet-migrated call sites already use). Phase 3 (Financial
Integration) is next on CHANGES.md's own roadmap.
