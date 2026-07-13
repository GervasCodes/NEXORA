const settingsRepository = require("./settings.repository");

// Fallbacks used only if the row is somehow missing (e.g. migration ran
// but the default INSERT was skipped) - keeps the platform functional
// instead of throwing mid-checkout.
const DEFAULTS = {
    commission_rate: "10",
    rider_delivery_fee: "3000",
    seller_verification_fee: "20000"
};

// platform_settings is read on nearly every order (commission),
// completed delivery (rider fee), and verification page load (fee
// amount) - but it only ever changes when an admin edits it, which is
// rare. A short TTL cache turns "one DB round trip per request" into
// "one DB round trip per CACHE_TTL_MS window", with correctness intact:
// updateSettings() below invalidates it immediately on write, so a change
// is visible to every new request right away, not up to 30s later.
const CACHE_TTL_MS = 30_000;
let cache = null;
let cacheExpiresAt = 0;

const getCachedAll = async () => {
    if (cache && Date.now() < cacheExpiresAt) {
        return cache;
    }

    const rows = await settingsRepository.findAll();
    const map = { ...DEFAULTS };
    rows.forEach((row) => {
        map[row.setting_key] = row.setting_value;
    });

    cache = map;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return cache;
};

const invalidateCache = () => {
    cache = null;
    cacheExpiresAt = 0;
};

exports.getAll = async () => getCachedAll();

// Platform's cut, as a percentage (e.g. 10 => 10%)
exports.getCommissionRate = async () => {
    const map = await getCachedAll();
    return Number(map.commission_rate);
};

// Flat amount (TZS) paid to a delivery agent per completed delivery
exports.getRiderDeliveryFee = async () => {
    const map = await getCachedAll();
    return Number(map.rider_delivery_fee);
};

// Flat fee (TZS) a seller pays once to receive the paid Verified Seller badge
exports.getVerificationFee = async () => {
    const map = await getCachedAll();
    return Number(map.seller_verification_fee);
};

exports.updateSettings = async (data) => {
    if (data.commission_rate !== undefined) {
        await settingsRepository.upsert("commission_rate", String(data.commission_rate));
    }
    if (data.rider_delivery_fee !== undefined) {
        await settingsRepository.upsert("rider_delivery_fee", String(data.rider_delivery_fee));
    }
    if (data.seller_verification_fee !== undefined) {
        await settingsRepository.upsert("seller_verification_fee", String(data.seller_verification_fee));
    }
    invalidateCache();
    return exports.getAll();
};
