# Dispatch: match by seller proximity, not buyer proximity (ad-hoc fix)

## Problem

The nearest-agent offer flow (`delivery.service.js` — `startMatching` /
`offerToNextCandidate` / `declineOffer`) ranked online delivery agents by
straight-line distance to the **buyer's** delivery pin
(`order.delivery_lat/delivery_lng`). An agent needs to reach the **shop**
and collect the order first — the buyer's location is irrelevant until
then. This meant the platform could dispatch the wrong agent: one who
happened to live near the buyer but was far from the seller they'd need
to pick up from.

Delivery *pricing* (`deliveryPricing.service.js`) already measured
correctly (seller pickup pin → buyer pin), so this only affected which
agent got offered the job, not how much they were paid for it.

## Fix

- Added `getSellerPickupPoint(order)` in `delivery.service.js`, which
  resolves the order's single seller (`orderRepository.findOrderSellerId`
  — every non-parent order has exactly one, by construction) and reads
  their `pickup_lat`/`pickup_lng`/`store_name`/`address` from
  `seller_profiles`.
- `startMatching`, `offerToNextCandidate`, `expireAndAdvance`, and
  `declineOffer` now all rank and re-rank candidates against the
  **shop's** pickup point instead of the buyer's destination. If the
  seller hasn't set a pickup pin yet, matching is skipped and the order
  falls back to the manual "available for pickup" pool — the same
  fallback behavior a missing buyer pin used to trigger.
- **Smart dispatch**: candidates are first filtered/sorted by cheap
  straight-line distance to the shop (`OFFER_RADIUS_KM`), then the
  closest few (`ETA_CANDIDATE_POOL_SIZE = 5`) get a real road-routing ETA
  lookup via the existing routing abstraction
  (`services/routing/routing.service.js`, OSRM with automatic
  straight-line fallback), per the agent's own vehicle type. The agent
  who can actually **reach the shop soonest by road** is offered the
  job — not just whoever is nearest as the crow flies. A closer agent
  stuck behind a slow route can lose out to a farther one with a faster
  path.
- `findCandidateAgents` (`delivery.repository.js`) now also selects
  `vehicle_type`, so the ETA lookup can use the right OSRM profile
  (car/motorcycle/bicycle/etc.) per candidate.
- The offer payload sent to the winning agent (socket + push) now
  describes the trip to the **shop** (`pickupStoreName`, `pickupAddress`,
  `distanceToSellerKm`, `etaToSellerMinutes`) instead of the buyer's
  shipping address — that's what the agent needs to know before
  accepting a pickup.

No schema changes were needed — `seller_profiles.pickup_lat/pickup_lng`
already existed (migration 033) and were already used by the pricing
side; this only changes which point the *matching* logic measures from.

## Admin dispatch board — live map

- `admin.repository.js`'s `findActiveDeliveries` (used by
  `GET /admin/dispatch`) now also returns each active delivery's seller
  pickup pin (`seller_store_name`, `seller_pickup_lat`,
  `seller_pickup_lng`), joined via a de-duplicated subquery over
  `order_items` (an order's items always share one seller, so
  `MIN(seller_id)` per `order_id` is a safe way to collapse to one row
  without fanning out the delivery rows).
- New `frontend/src/components/AdminDispatchMap.jsx`: a live
  react-leaflet map (same styling/icons as the existing per-order
  `DeliveryTrackingMap.jsx`) that plots, for every active delivery, the
  shop pin, the buyer destination pin, and a dashed route line between
  them — plus every online agent's current position. It auto-fits the
  map to whatever's currently on it and re-renders from the same
  `deliveries`/`agents` state `AdminDispatch.jsx` already keeps live via
  the `dispatch:*` socket events (no new sockets or polling added).
- Wired into `AdminDispatch.jsx` above the existing list view.

## Testing

- Rewrote/extended `tests/unit/delivery/delivery.service.test.js` for the
  new seller-based ranking, including a case proving a farther-but-faster
  agent (by road ETA) is chosen over a closer-but-slower one.
- Full backend unit suite: **577/577 passing**.
- Frontend: `npx vite build` succeeds; `eslint` clean on all
  changed/added files.

## Files touched

- `backend/src/modules/delivery/delivery.service.js`
- `backend/src/modules/delivery/delivery.repository.js`
- `backend/src/modules/admin/admin.repository.js`
- `backend/tests/unit/delivery/delivery.service.test.js`
- `frontend/src/components/AdminDispatchMap.jsx` (new)
- `frontend/src/pages/admin/AdminDispatch.jsx`
- `docs/DISPATCH_SELLER_PROXIMITY.md` (new, this file)
