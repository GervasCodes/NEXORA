# Phase 7 - Location autofill (Workstream B)

Frontend only. Unzip over the repository root (paths start with NEXORA/). No backend change, no migration.

## What changed
- One-shot location: `utils/geolocation.js#getPositionOnce` (getCurrentPosition only; no watchPosition anywhere).
  Failures are classified: denied / unavailable / timeout / unsupported.
- `LocationPicker.jsx` (also used by seller store settings; its props are backward compatible):
  - Clear message under the map for each failure above, plus "couldn't find an address for that spot"
    (reverse-geocode failure: the pin is kept, the form is untouched). Previously all of these failed silently.
  - Draggable pin; dropping it re-resolves the address (stale lookups are ignored).
  - Optional prompt card ("Fill in your address from your location?" - Use my location / No thanks) via `showPrompt`;
    Checkout turns it on only while a new address is being entered and there is no pin yet.
  - The map now pans to a pin that arrives from "use my location" (the `center` prop only applied on first render).
  - All strings via t() (`location.*`), English and Kiswahili.
- `Checkout.jsx`:
  - Landmark field. Required for an address the buyer typed (the fallback when location/autofill is not used),
    optional when the address was suggested from the pin. Sent to the API folded into `shipping_address`
    ("12 Kinondoni Rd - Near: Shell petrol", max 255 chars; there is no landmark column and no migration was needed).
  - "Confirm address" step: when fields were suggested from a pin, the buyer must tick "Yes, this delivery address is
    correct" before ordering; moving the pin and re-suggesting resets the tick. Uses the Phase 6 inline-error + focus pattern.
  - Saved / default address autofill is untouched: a chosen saved address shows no address inputs, needs no landmark or
    confirmation, and moving the pin never overwrites it. Pickup points are unaffected.
- Nominatim kept as is (no new vendor, key or paid API).

## Files added (3)
- frontend/src/utils/geolocation.js
- frontend/tests/utils/geolocation.test.js
- frontend/tests/components/LocationPicker.test.jsx

## Files modified (5)
- frontend/src/components/LocationPicker.jsx
- frontend/src/pages/Checkout.jsx
- frontend/src/i18n/en.js, frontend/src/i18n/sw.js (24 keys each: `location.*`, `checkout.landmark*`, `checkout.addressConfirm.*`, 2 error keys)
- frontend/tests/pages/Checkout.test.jsx (helpers now fill the landmark; payload expectation includes it; 3 new tests)

## Files deleted
None.

## New env vars / migrations / dependencies
None.

## How to test
    cd frontend
    npx vitest run tests/utils/geolocation.test.js tests/components/LocationPicker.test.jsx tests/pages/Checkout.test.jsx
    npx vitest run          # full suite
    npx eslint src tests
    npx vite build

Manual (real phone, HTTPS, English and Kiswahili; geolocation needs a secure origin):
1. Checkout, no saved address: prompt appears. "No thanks" hides it; typing works; landmark is required.
2. "Use my location" -> allow: pin appears and the map pans to it, address/city/region fill, confirm box appears,
   landmark becomes optional. Ordering without ticking confirm shows the inline error and focuses the box.
3. Drag the pin: address re-fills and the confirm tick resets.
4. Block location in the browser first: a clear "turned off for this site" message, form still usable.
5. Turn off the network after allowing location: "couldn't find an address" message, pin kept.
6. With a saved default address: it is preselected as before; moving the pin does not change it.
7. Place an order and check the order's shipping address in admin: it ends with "- Near: <landmark>".

## Decisions / flags
- Landmark is stored inside the address text because the order has no landmark column. A dedicated column
  would need a migration (next number is 162); say so if you prefer that.
- Nominatim has an unofficial ~1 request/second limit; one lookup per pin placement/drop stays well inside it.
  Ask before moving to Google/Mapbox (not done).
