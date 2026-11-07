// One-shot browser location (Phase 7). Deliberately getCurrentPosition only -
// never watchPosition: the checkout needs a single starting point to suggest an
// address from, not a live track of the buyer.
//
// Rejects with an Error whose `code` is one of:
//   "unsupported" - no navigator.geolocation (old browser, or insecure origin)
//   "denied"      - the person (or their browser settings) refused permission
//   "unavailable" - the device could not work out a position
//   "timeout"     - no answer in time
const REASON_BY_GEO_CODE = { 1: "denied", 2: "unavailable", 3: "timeout" };

export function getPositionOnce({ timeout = 8000, enableHighAccuracy = true, maximumAge = 60000 } = {}) {
    return new Promise((resolve, reject) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            reject(Object.assign(new Error("Geolocation is not supported"), { code: "unsupported" }));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
            (err) => reject(Object.assign(new Error(err?.message || "Location failed"), { code: REASON_BY_GEO_CODE[err?.code] || "unavailable" })),
            { enableHighAccuracy, timeout, maximumAge }
        );
    });
}

// orders.shipping_address is VARCHAR(255), and there is no landmark column, so
// a landmark travels inside the address text: "12 Kinondoni Rd - Near: Shell petrol".
// The landmark is trimmed first if the two together would not fit.
const ADDRESS_MAX = 255;
export function composeAddressWithLandmark(address, landmark, nearLabel = "Near") {
    const base = String(address || "").trim();
    const mark = String(landmark || "").trim();
    if (!mark) return base.slice(0, ADDRESS_MAX);
    const joiner = ` - ${nearLabel}: `;
    const room = ADDRESS_MAX - base.length - joiner.length;
    if (room < 10) return base.slice(0, ADDRESS_MAX); // address alone is already near the limit
    return `${base}${joiner}${mark.slice(0, room)}`;
}
