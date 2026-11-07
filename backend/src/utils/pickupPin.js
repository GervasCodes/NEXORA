// Phase 2: rules for a seller's store ("pickup") pin. Dispatch offers an
// order to drivers near this point, so a missing or nonsense pin silently
// breaks delivery. Pure helpers, no DB access.

// Bounding box of mainland Tanzania plus Zanzibar and Mafia, with a small
// margin. It rejects (0,0), swapped lat/lng and pins in other countries
// without needing a geocoder.
const TZ_BOUNDS = { minLat: -11.9, maxLat: -0.9, minLng: 29.2, maxLng: 40.6 };

// A GPS fix at least this accurate (metres) counts as "verified".
const VERIFIED_ACCURACY_M = 100;
// Anything vaguer than this is rejected as a usable fix.
const MAX_ACCURACY_M = 5000;

const toNumber = (value) => (value === null || value === undefined || value === "" ? NaN : Number(value));

const isValidTanzaniaPin = (lat, lng) => {
    const la = toNumber(lat);
    const ln = toNumber(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
    return la >= TZ_BOUNDS.minLat && la <= TZ_BOUNDS.maxLat && ln >= TZ_BOUNDS.minLng && ln <= TZ_BOUNDS.maxLng;
};

// A seller "has a usable pin" when both coordinates are present and inside
// Tanzania. Works on a seller_profiles row.
const hasUsablePin = (seller) => Boolean(seller) && isValidTanzaniaPin(seller.pickup_lat, seller.pickup_lng);

const isVerifiedAccuracy = (accuracyM) => {
    const a = toNumber(accuracyM);
    return Number.isFinite(a) && a >= 0 && a <= VERIFIED_ACCURACY_M;
};

const PIN_REQUIRED_CODE = "PICKUP_PIN_REQUIRED";
const PIN_REQUIRED_MESSAGE = "Set your store location first (Store settings > Pickup location) so delivery drivers can find you";

// Throws a 409 error carrying a stable code the UI can react to.
const assertSellerHasPin = (seller) => {
    if (!hasUsablePin(seller)) {
        throw Object.assign(new Error(PIN_REQUIRED_MESSAGE), { code: PIN_REQUIRED_CODE, status: 409 });
    }
};

module.exports = {
    TZ_BOUNDS,
    VERIFIED_ACCURACY_M,
    MAX_ACCURACY_M,
    isValidTanzaniaPin,
    hasUsablePin,
    isVerifiedAccuracy,
    assertSellerHasPin,
    PIN_REQUIRED_CODE,
    PIN_REQUIRED_MESSAGE
};
