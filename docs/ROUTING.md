# Routing (Phase 5)

Phase 5 replaces NEXORA's straight-line ("as the crow flies") distance and
ETA math with real road-network routing, rolled out in stages:

- **5A — Routing foundation** (done): a standalone routing
  abstraction layer, with OSRM as the primary provider and the existing
  straight-line math kept as an automatic fallback. Nothing in the app
  calls it yet.
- **5B — Road distance & travel time** (done): the tracking-summary call
  site (`delivery.service.js`'s `buildTrackingSummary`) switches from
  `haversineKm` to `routing.service.getRoute()`. See "Phase 5B — what
  changed" below.
- **5C — ETA integration** (done): the road-routing duration now flows
  into *live* tracking - every `agent:location` ping and every delivery
  status transition pushes a fresh road-routing ETA over the socket,
  instead of the frontend approximating one with a client-side
  straight-line calculation between ticks. See "Phase 5C — what changed"
  below.
- **5D — Pricing integration** (done): fare/quotation calculations
  (`deliveryPricing.service.js`'s `calculateDeliveryFee`) use road
  distance and travel time instead of straight-line distance. See
  "Phase 5D — what changed" below.
- **5E — Validation**: tests, lint, build, and a Phase 5 summary report.

## Why an abstraction layer

Before Phase 5, every distance calculation in the codebase called
`utils/geo.js`'s `haversineKm` directly, and every ETA calculation called
`utils/eta.js`'s `estimateEtaMinutes` directly. Both are simple, dependency-
free, and always available — but a straight line badly underestimates real
travel distance/time on Tanzania's road network (rivers, one-ways, the lack
of a bridge where the straight line assumes one).

`backend/src/services/routing/routing.service.js` is the single place the
rest of the app now goes through for "how far / how long between these two
points". It has one job: return a road distance and travel time, using a
real routing provider when it can, and falling back to the same
straight-line math the app already had when it can't — so a routing
provider outage degrades accuracy, not availability.

## Module layout

```
backend/src/
  config/routing.js                          # env-var-driven config, sane defaults
  services/routing/
    routing.service.js                       # public API - getRoute()
    routingError.js                          # RoutingProviderError
    providers/
      osrm.provider.js                       # calls a real OSRM instance over HTTP
      fallback.provider.js                   # wraps haversineKm + estimateEtaMinutes
  tests/unit/routing/
    routing.service.test.js
    osrm.provider.test.js
    fallback.provider.test.js
```

## Public API

```js
const routingService = require("./services/routing/routing.service");

const result = await routingService.getRoute({
    originLat, originLng,   // e.g. seller pickup pin, or agent's current position
    destLat, destLng,       // e.g. order delivery pin
    vehicleType              // optional - "bicycle" | "motorcycle" | "tuktuk" | "car" | "van"
});

// result:
// {
//   distanceKm: number,
//   durationMinutes: number,
//   provider: "osrm" | "fallback",   // which provider actually answered
//   degraded: boolean                 // true only if this is an *unplanned*
//                                      // fallback (osrm failed) - false when
//                                      // "fallback" is the configured primary
// }
```

`getRoute` never throws for "OSRM is unreachable" as long as
`ROUTING_FALLBACK_ENABLED` is `true` (the default) — callers can treat the
return value as always usable. It only throws (a `RoutingProviderError`)
when the input coordinates are missing/invalid, or when OSRM fails *and*
fallback has been explicitly disabled.

## Configuration

All in `backend/.env` (see `backend/.env` for the full annotated list),
every one optional with a working default:

| Variable | Default | Meaning |
|---|---|---|
| `ROUTING_PROVIDER` | `osrm` | `osrm` or `fallback`. Set to `fallback` to force straight-line routing everywhere (offline dev, or before you've stood up OSRM). |
| `OSRM_BASE_URL` | `https://router.project-osrm.org` | OSRM server to call. The default is OSRM's public demo — fine for development, but rate-limited with no uptime SLA. |
| `OSRM_PROFILE` | `driving` | Default OSRM profile when a vehicle type doesn't map to one explicitly. |
| `OSRM_TIMEOUT_MS` | `5000` | How long to wait for OSRM before treating the request as failed. |
| `ROUTING_FALLBACK_ENABLED` | `true` | Whether an OSRM failure/timeout falls back to straight-line routing instead of throwing. |

### Vehicle type → OSRM profile

OSRM ships three profiles (`driving`, `walking`, `cycling`) — there's no
dedicated motorcycle/tuktuk profile. `osrm.provider.js` maps NEXORA's
delivery `vehicleType` values to the closest OSRM profile:

| `vehicleType` | OSRM profile |
|---|---|
| `bicycle` | `cycling` |
| `motorcycle`, `tuktuk`, `car`, `van` | `driving` |
| anything else / missing | `OSRM_PROFILE` (default `driving`) |

## Running your own OSRM instance

The public demo server is not suitable for production traffic. A
self-hosted OSRM instance for Tanzania (or East Africa generally) can be
run from an OpenStreetMap extract:

```bash
# One-time: download an extract and pre-process it for the "driving" profile
wget https://download.geofabrik.de/africa/tanzania-latest.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/tanzania-latest.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/tanzania-latest.osrm
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/tanzania-latest.osrm

# Run the routing server
docker run -d --name osrm -p 5000:5000 -v "${PWD}:/data" \
  osrm/osrm-backend osrm-routed --algorithm mld /data/tanzania-latest.osrm
```

Then set `OSRM_BASE_URL=http://localhost:5000` (or wherever it's deployed)
in `.env`. Repeat the extract/partition/customize steps for the `bicycle`
and `foot` profiles too if you want dedicated cycling/walking routing
rather than everything falling back to the `driving` profile.

## Error handling

`osrm.provider.js` throws a `RoutingProviderError` (never a raw
network/parse error) for every failure mode, tagged with a `reason` so
callers/logs can tell them apart:

- `timeout` — the request didn't complete within `OSRM_TIMEOUT_MS`
- `network` — DNS/connection failure
- `bad_response` — non-2xx HTTP status, invalid JSON, or a response
  missing the fields it needs
- `no_route` — OSRM understood the request but found no route between
  the two points (e.g. `"code": "NoRoute"`)

`routing.service.js` catches all of these uniformly and, if fallback is
enabled, logs a one-line warning and returns the straight-line result
instead of propagating the error.

## Phase 5B — what changed

One call site now goes through `routingService.getRoute()` instead of
calling `haversineKm`/`estimateEtaMinutes` directly:

- **`delivery.service.js`'s `buildTrackingSummary`** (used by
  `getDelivery`, which powers the tracking widget and full tracking
  page) - routes from wherever the agent actually is (or the pickup pin,
  pre-pickup) to the delivery destination. Now `async` - `getDelivery`
  awaits it. The response shape is unchanged (`pickup`, `destination`,
  `distance_remaining_km`, `eta_minutes`) with two additive fields,
  `routing_provider` and `degraded`, so any existing API consumer that
  only reads the original fields keeps working untouched.

**Deliberately left on `haversineKm`:** nearest-agent matching
(`delivery.service.js`'s `offerToNextCandidate`) still ranks candidate
agents by straight-line distance. That function evaluates every
online agent within range on every matching attempt - running a real
routing call per candidate would multiply OSRM traffic and slow down
what needs to stay a fast, synchronous ranking step. The nearest
candidate by straight-line distance is a fine proxy for "who to offer
this to first"; the road-accurate distance/fee is calculated once,
after a candidate accepts, via `calculateDeliveryFee` (Phase 5D).

**Persistence:** `deliveries` gained two columns (migration 039):
`estimated_duration_minutes` (the road-routing travel-time estimate at
assignment time, alongside the existing `distance_km`) and
`routing_provider` (which provider answered - `'osrm'` or `'fallback'`,
purely informational). Both columns are populated as of Phase 5D, once
`calculateDeliveryFee` (the source of the values passed into
`deliveryRepository.create`) actually computes them - see "Phase 5D —
what changed" below. Both are set the moment a delivery is created
(claim, offer-accept, or seller roster assignment) and, like
`distance_km`, are `NULL` whenever the flat fallback fee was used
(no pickup/delivery pin pair to route between).

## Phase 5C — what changed

Before Phase 5C, the *REST* tracking response (`GET /delivery/:id`, via
`buildTrackingSummary`) already returned a road-routing distance/ETA
(Phase 5B), but the *live* socket updates that stream in between REST
calls - `agent:position` (sent on every `agent:location` ping) and
`delivery:status` (sent on every delivery status transition) - only
ever carried a bare position or status. The frontend filled that gap
itself: `TrackingWidget.jsx` and `OrderTrackingPage.jsx` recomputed a
straight-line (`haversineKm` + `estimateEtaMinutes`) distance/ETA on
every tick, so the number shown live during a delivery quietly drifted
from the road-accurate figure the same page had shown on first load.

Phase 5C closes that gap by pushing the same road-routing calculation
into both live socket events instead:

- **`delivery.service.js`** gained a shared `computeRouteEta()` helper
  (the calculation `buildTrackingSummary` already did, extracted so
  more than one caller can use it) and two callers now use it:
  - **`updateAgentLocation(agentId, lat, lng)`** - previously returned a
    bare array of order ids for the deliveries an agent has in
    progress. It now returns, for each of those orders, the
    distance-remaining/ETA from the agent's *new* position to that
    order's destination: `{ orderId, distance_remaining_km, eta_minutes,
    routing_provider, degraded }`. This is an internal function (its
    only caller is `socket.js`), so the shape change has no external
    API impact - both call sites were updated together.
  - **`updateDeliveryStatus(orderId, agentId, newStatus, notes)`** -
    after persisting the new status, it now re-reads the delivery (via
    `findByOrderIdWithAgent`, so `.status` reflects the just-persisted
    transition) and recomputes the tracking summary, so a transition
    like "picked up" -> "in transit" - which changes whether the ETA is
    measured from the pickup pin or the agent's live position - is
    reflected immediately.
- **`delivery.repository.js`'s `findByAgent`** gained a `LEFT JOIN` on
  `users` for `agent_vehicle_type`, so `updateAgentLocation` can pass the
  right vehicle type through to the routing service without an extra
  query.
- **`socket.js`**: the `agent:location` handler now emits `agent:position`
  with four additive fields - `distance_remaining_km`, `eta_minutes`,
  `routing_provider`, `degraded` - alongside the existing `orderId`,
  `lat`, `lng`, `timestamp`. The `delivery:status` emit gains the same
  four fields.
- **Frontend** (`TrackingWidget.jsx`, `OrderTrackingPage.jsx`): no longer
  import or call `haversineKm`/`estimateEtaMinutes` for distance/ETA.
  Both now hold onto whichever road-routing distance/ETA the backend
  last sent (from the initial `GET /delivery/:id` response, then from
  each `agent:position`/`delivery:status` event) and simply display it.
  `haversineKm`/`estimateEtaMinutes` remain in `frontend/src/utils/geo.js`
  for `bearingDegrees`/other geometry helpers that don't need road
  routing (e.g. rotating the map marker to face the direction of
  travel) - only the distance/ETA call sites moved.

No REST response shape changed in this phase - only the two live socket
events gained additive fields, so any consumer reading just the
pre-5C fields keeps working untouched.

## Phase 5D — what changed

The last remaining straight-line call site closes in this phase:
**`deliveryPricing.service.js`'s `calculateDeliveryFee(order, vehicleType)`**
- the function that decides what an agent is paid for a delivery, and
the only "fare/quotation" calculation in the codebase - now routes the
seller's pickup pin to the order's delivery pin through
`routingService.getRoute()` instead of calling `haversineKm` directly.

- The distance-band fee calculation itself (`computeBandedFee`) is
  unchanged - only where the distance number it's handed comes from
  changed. Bands are still configured (and compared against) in
  kilometers; those kilometers are just road-accurate now instead of
  as-the-crow-flies.
- The function's return value gained `durationMinutes`, `routingProvider`
  (`"osrm"` or `"fallback"`), and `degraded` alongside the existing
  `fee`/`distanceKm`/`method` fields - the same additive shape used
  everywhere else in Phase 5, so existing callers that only read
  `fee`/`distanceKm`/`method` keep working untouched.
- `vehicleType` is a new optional second parameter - it only affects
  which OSRM profile is used (e.g. a bicycle agent's fee is measured
  off cycling-appropriate roads rather than a car route), never which
  fee band a distance falls into. None of the three call sites
  (`delivery.service.js`'s `claimDelivery`/`acceptOffer`,
  `order.service.js`'s `updateOrderStatusBySeller`) currently pass it,
  so today every quote resolves through the default OSRM profile -
  passing the assigned agent's `vehicle_type` through from those call
  sites is a natural follow-up, not required for this phase since it
  only changes routing precision, never correctness.
- The flat-fee fallback path (no delivery pin, no seller, or no seller
  pickup pin) is unchanged: no routing call is made at all, so that
  shape stays `{ fee, distanceKm: null, durationMinutes: null,
  method: "flat" }` with no `routingProvider`/`degraded` to report.

**Persistence:** with `calculateDeliveryFee` now actually computing
`durationMinutes`/`routingProvider`, the `estimated_duration_minutes`/
`routing_provider` columns added by migration 039 (see "Phase 5B — what
changed" above) are populated for the first time - every delivery
created via claim, offer-accept, or seller roster assignment now
snapshots a real road-routing travel-time estimate alongside its
distance, instead of `NULL`.

No REST/socket response shape changed in this phase - `calculateDeliveryFee`
is only ever consumed internally (by the three delivery-creation call
sites above), so this phase has no API surface impact at all.
