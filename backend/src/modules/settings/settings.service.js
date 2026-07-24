const settingsRepository = require("./settings.repository");
const { DEFAULT_BANDS, parseBandsConfig } = require("../../utils/deliveryPricing");

// Fallbacks used only if the row is somehow missing (e.g. migration ran
// but the default INSERT was skipped) - keeps the platform functional
// instead of throwing mid-checkout.
const DEFAULTS = {
    commission_rate: "10",
    rider_delivery_fee: "3000",
    seller_verification_fee: "20000",
    // TZS per 1 USD. Only used to convert a TZS amount into USD for
    // PayPal, which (unlike Snippe) doesn't support TZS as a transaction
    // currency - see providers/paypal.provider.js. Admin-editable so it
    // can be kept roughly in line with the real exchange rate without a
    // deploy; it's a coarse approximation, not a live FX feed.
    usd_exchange_rate: "2600",
    // Tanzania distance-band delivery pricing (migration 033) - see
    // utils/deliveryPricing.js for the shape and getDeliveryDistanceBands
    // below. Only used when both the seller's pickup pin and the order's
    // delivery pin are set; rider_delivery_fee above remains the fallback
    // whenever either pin is missing.
    delivery_distance_bands: JSON.stringify(DEFAULT_BANDS),
    // Flat cost (TZS) a seller pays per day to sponsor one of their own
    // products (migration 051, Phase 8A). Admin-editable like every other
    // rate above; a running campaign snapshots the rate that applied when
    // it was purchased (sponsorship_campaigns.daily_rate), so changing
    // this later never rewrites what a seller already paid.
    sponsorship_daily_rate: "5000",
    // Flat cost (TZS) a seller pays per day to have their store featured
    // in one department's "Featured stores" row (migration 052, Phase
    // 8B). Priced above sponsorship_daily_rate by default since it
    // promotes the whole store's placement, not one product. A running
    // campaign snapshots the rate that applied when purchased
    // (store_featured_campaigns.daily_rate), same reasoning as
    // sponsorship_daily_rate above.
    featured_store_daily_rate: "8000",
    // Flat cost (TZS) a seller pays per day to sponsor an entire department
    // on the homepage grid (migration 053, Phase 8C). Priced above
    // featured_store_daily_rate since it's homepage-wide visibility, not a
    // placement within a department a shopper has already opened. A
    // running campaign snapshots the rate that applied when purchased
    // (department_sponsorship_campaigns.daily_rate), same reasoning as the
    // two rates above.
    department_sponsorship_daily_rate: "12000",
    // Days after delivery, with no open dispute, before a seller's held
    // order earnings become withdrawable (migration 054, Phase 9B). Not
    // read anywhere yet - Phase 9D's release job is the first caller of
    // getEscrowHoldDays() below.
    escrow_hold_days: "5"
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

// TZS per 1 USD - see DEFAULTS comment above.
exports.getUsdExchangeRate = async () => {
    const map = await getCachedAll();
    return Number(map.usd_exchange_rate);
};

// Parsed { bands, per_km_beyond } config for Tanzania distance-based
// delivery pricing - see utils/deliveryPricing.js. Always returns a
// usable config (falls back to DEFAULT_BANDS if the stored value is
// missing or corrupt), so callers never need their own fallback.
exports.getDeliveryDistanceBands = async () => {
    const map = await getCachedAll();
    return parseBandsConfig(map.delivery_distance_bands);
};

// Flat cost (TZS) a seller currently pays per day to sponsor one product.
exports.getSponsorshipDailyRate = async () => {
    const map = await getCachedAll();
    return Number(map.sponsorship_daily_rate);
};

// Flat cost (TZS) a seller currently pays per day to have their store
// featured in one department.
exports.getFeaturedStoreDailyRate = async () => {
    const map = await getCachedAll();
    return Number(map.featured_store_daily_rate);
};

// Flat cost (TZS) a seller currently pays per day to sponsor an entire
// department on the homepage grid.
exports.getDepartmentSponsorshipDailyRate = async () => {
    const map = await getCachedAll();
    return Number(map.department_sponsorship_daily_rate);
};

// Days after delivery, with no open dispute, before a seller's held
// order earnings become withdrawable. Unused until Phase 9D's release
// job calls this.
exports.getEscrowHoldDays = async () => {
    const map = await getCachedAll();
    return Number(map.escrow_hold_days);
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
    if (data.usd_exchange_rate !== undefined) {
        await settingsRepository.upsert("usd_exchange_rate", String(data.usd_exchange_rate));
    }
    if (data.delivery_distance_bands !== undefined) {
        await settingsRepository.upsert("delivery_distance_bands", JSON.stringify(data.delivery_distance_bands));
    }
    if (data.sponsorship_daily_rate !== undefined) {
        await settingsRepository.upsert("sponsorship_daily_rate", String(data.sponsorship_daily_rate));
    }
    if (data.featured_store_daily_rate !== undefined) {
        await settingsRepository.upsert("featured_store_daily_rate", String(data.featured_store_daily_rate));
    }
    if (data.department_sponsorship_daily_rate !== undefined) {
        await settingsRepository.upsert("department_sponsorship_daily_rate", String(data.department_sponsorship_daily_rate));
    }
    if (data.escrow_hold_days !== undefined) {
        await settingsRepository.upsert("escrow_hold_days", String(data.escrow_hold_days));
    }
    invalidateCache();
    return exports.getAll();
};
