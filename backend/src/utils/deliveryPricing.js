// Bolt-style tiered distance pricing for delivery agent fees.
//
// Config shape (stored as JSON in platform_settings.delivery_distance_bands,
// see migration 033):
//   {
//     "bands": [{ "up_to_km": 3, "fee": 2000 }, { "up_to_km": 7, "fee": 4000 }, ...],
//     "per_km_beyond": 600
//   }
//
// Each band covers "0 up to (and including) up_to_km" at a flat fee - the
// first band a distance fits under wins, so bands don't need to be
// contiguous or gap-free, just sorted ascending (sortBands below sorts
// defensively regardless of storage order). Distances beyond the last
// band's up_to_km are charged that band's fee plus per_km_beyond for
// every km past it.

exports.DEFAULT_BANDS = {
    bands: [
        { up_to_km: 3, fee: 2000 },
        { up_to_km: 7, fee: 4000 },
        { up_to_km: 12, fee: 6000 },
        { up_to_km: 20, fee: 9000 }
    ],
    per_km_beyond: 600
};

const sortBands = (bands) => [...bands].sort((a, b) => a.up_to_km - b.up_to_km);

const isValidBandsConfig = (config) => {
    if (!config || !Array.isArray(config.bands) || config.bands.length === 0) {
        return false;
    }

    return config.bands.every(
        (band) =>
            typeof band.up_to_km === "number" && band.up_to_km > 0 &&
            typeof band.fee === "number" && band.fee >= 0
    );
};

exports.isValidBandsConfig = isValidBandsConfig;

// Safe to call with anything - a corrupt/hand-edited platform_settings row
// can never crash a checkout or delivery claim, it just falls back to
// DEFAULT_BANDS.
exports.parseBandsConfig = (raw) => {
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

        if (!isValidBandsConfig(parsed)) {
            return exports.DEFAULT_BANDS;
        }

        const perKmBeyond = Number(parsed.per_km_beyond);

        return {
            bands: parsed.bands,
            per_km_beyond: Number.isFinite(perKmBeyond) && perKmBeyond >= 0 ? perKmBeyond : 0
        };
    } catch {
        return exports.DEFAULT_BANDS;
    }
};

// distanceKm: straight-line seller-pickup-to-buyer-delivery distance (see
// utils/geo.js -> haversineKm). fallbackFee: used if config turns out to
// have no usable bands (shouldn't happen once parseBandsConfig has run,
// but kept as a second safety net here since this function may be called
// directly in tests with a hand-built config).
exports.computeBandedFee = (distanceKm, config, fallbackFee) => {
    if (!isValidBandsConfig(config)) {
        return fallbackFee;
    }

    const bands = sortBands(config.bands);

    for (const band of bands) {
        if (distanceKm <= band.up_to_km) {
            return band.fee;
        }
    }

    const lastBand = bands[bands.length - 1];
    const perKmBeyond = Number(config.per_km_beyond) || 0;
    const extraKm = distanceKm - lastBand.up_to_km;

    return Math.round(lastBand.fee + extraKm * perKmBeyond);
};
