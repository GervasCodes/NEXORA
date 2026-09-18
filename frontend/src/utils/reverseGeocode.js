// Reverse geocoding for LocationPicker.jsx - turns a dropped map pin into
// address/city/region text. Uses OpenStreetMap's Nominatim, the same OSM
// project this app already depends on for its map tiles (mapConfig.js) and
// the "&copy; OpenStreetMap contributors" attribution shown on every map,
// so this adds no new paid API, API key, or vendor.
//
// Nominatim's usage policy caps unauthenticated use at roughly one request
// per second and asks callers to identify their app. LocationPicker only
// calls this once per pin placement - a human clicking a map or tapping
// "use my location" - never in a loop or on every render, so that cap is
// never in danger of being hit.
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

// A distinguishing identifier for the app, per Nominatim's usage policy -
// sent as a query param since a custom User-Agent header can't be set
// from browser fetch() (the browser controls that header itself). Not a
// real contact email - Nominatim's own docs accept a plain app name here
// for exactly this "browser can't set User-Agent" case; a fabricated-
// looking email would be worse, not better.
const APP_IDENTIFIER = "nexora-marketplace";

// Reverse-geocodes {lat, lng} and returns the best-guess {address, city,
// region} strings for pre-filling a form. Any field Nominatim can't
// resolve comes back as an empty string rather than undefined, so callers
// can safely do `resolved.city || fallback` without an extra check.
// Throws on a network error or non-OK response - callers decide how to
// handle a failed lookup (LocationPicker swallows it and leaves the pin
// placed but the address fields untouched).
export async function reverseGeocode({ lat, lng }, { signal } = {}) {
    const url = `${NOMINATIM_REVERSE_URL}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&email=${APP_IDENTIFIER}`;

    const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal
    });

    if (!response.ok) {
        throw new Error(`Reverse geocode request failed (${response.status})`);
    }

    const data = await response.json();
    const a = data.address || {};

    const city = a.city || a.town || a.village || a.municipality || a.county || "";
    const region = a.state || a.region || a.state_district || "";

    // Street-level address: "house_number road" when both are present
    // (e.g. "12 Kinondoni Road"), falling back to a named place
    // (suburb/neighbourhood) and finally the full display_name Nominatim
    // already assembled, so there's always *something* usable even for a
    // pin dropped somewhere with sparse address data.
    const street = [a.house_number, a.road].filter(Boolean).join(" ");
    const address = street || a.suburb || a.neighbourhood || data.display_name || "";

    return { address, city, region };
}
