const deliveryRatesRepository = require("./deliveryRates.repository");
const settingsService = require("../settings/settings.service");
const auditService = require("../audit/audit.service");
const {
    resolveRateVehicle,
    applyMonthlyChangeGuardrail,
    computeFuelFactor,
    computeRateFee,
    adjustDuration,
    localHour
} = require("../../utils/deliveryRates");

// Rider-pay quoting from rate cards + fuel factor, and ETA adjustment. Pure
// math lives in utils/deliveryRates.js; this file loads the rows. Everything
// is effective-dated: pass `asOf` to price as of a moment (default: now).

const VEHICLE_KEYS = ["boda", "bajaj", "car"];
const FUEL_PRODUCTS = ["petrol", "diesel"];

const badRequest = (message) => {
    const error = new Error(message);
    error.status = 400;
    return error;
};

exports.VEHICLE_KEYS = VEHICLE_KEYS;

// Fuel factor for a region/product. Falls back to the default region's caps
// when the region has none. Returns factor 1 when no cap data exists at all,
// so a missing fuel entry never blocks pricing.
exports.getFuelFactor = async ({ region, product = "petrol", asOf = new Date() }) => {
    const settings = await settingsService.getDeliveryRateSettings();
    const regionsToTry = [...new Set([region, settings.defaultRegion].filter(Boolean))];

    for (const candidate of regionsToTry) {
        const rows = await deliveryRatesRepository.findFuelRows(candidate, product, asOf);
        if (!rows.length) continue;

        const current = rows[0];
        const previous = rows[1] || null;
        const guarded = previous
            ? applyMonthlyChangeGuardrail(current.cap_price, previous.cap_price, settings.fuelMaxMonthlyChangePct)
            : { cap: Number(current.cap_price), limited: false };

        return {
            factor: computeFuelFactor({
                cap: guarded.cap,
                baselineCap: settings.fuelBaselineCap,
                passThroughPct: settings.fuelPassThroughPct
            }),
            cap: guarded.cap,
            enteredCap: Number(current.cap_price),
            limited: guarded.limited,
            baselineCap: settings.fuelBaselineCap,
            passThroughPct: settings.fuelPassThroughPct,
            region: candidate,
            product
        };
    }

    return { factor: 1, cap: null, enteredCap: null, limited: false, region: null, product, baselineCap: settings.fuelBaselineCap, passThroughPct: settings.fuelPassThroughPct };
};

// Rider pay for a distance. Returns null when no rate card exists for the
// vehicle or the default vehicle, so the caller can fall back to the old
// distance bands.
exports.quoteRiderPay = async ({ distanceKm, vehicleType, region, asOf = new Date() }) => {
    const settings = await settingsService.getDeliveryRateSettings();
    const vehicle = resolveRateVehicle(vehicleType, settings.defaultVehicle);

    let card = await deliveryRatesRepository.findCurrentCard(vehicle, asOf);
    let usedVehicle = vehicle;

    if (!card && vehicle !== settings.defaultVehicle) {
        card = await deliveryRatesRepository.findCurrentCard(settings.defaultVehicle, asOf);
        usedVehicle = settings.defaultVehicle;
    }

    if (!card) return null;

    const fuel = await exports.getFuelFactor({ region, product: card.fuel_product, asOf });
    const fee = computeRateFee({ card, distanceKm, fuelFactor: fuel.factor });

    return {
        fee,
        method: "rate_card",
        vehicle: usedVehicle,
        cardId: card.id,
        minFee: Number(card.min_fee),
        perKmRate: Number(card.per_km_rate),
        fuel
    };
};

// Adds peak-hour multiplier/buffer (and optionally the pickup handling
// buffer) on top of a routing duration. Region falls back to the default
// region's windows. Returns null for a null duration.
exports.adjustEta = async (durationMinutes, { region, date = new Date(), includeHandling = false, onlyHandling = false } = {}) => {
    if (durationMinutes == null) return null;

    const settings = await settingsService.getDeliveryRateSettings();

    // onlyHandling: the duration already carries the peak-hour windows, so
    // just add the pickup handling buffer.
    if (onlyHandling) {
        return Math.round(Number(durationMinutes) + (settings.handlingBufferMinutes || 0));
    }

    let adjustments = region ? await deliveryRatesRepository.findActiveAdjustments(region) : [];

    if (!adjustments.length) {
        adjustments = await deliveryRatesRepository.findActiveAdjustments(settings.defaultRegion);
    }

    return adjustDuration({
        durationMinutes,
        adjustments,
        hour: localHour(date),
        handlingBufferMinutes: includeHandling ? settings.handlingBufferMinutes : 0
    });
};

// ---- Admin -----------------------------------------------------------------

exports.getOverview = async () => {
    const [settings, cards, fuel, adjustments] = await Promise.all([
        settingsService.getDeliveryRateSettings(),
        deliveryRatesRepository.listCards(),
        deliveryRatesRepository.listFuel(),
        deliveryRatesRepository.listAdjustments()
    ]);

    const now = new Date();
    const currentCards = [];
    for (const vehicle of VEHICLE_KEYS) {
        const card = await deliveryRatesRepository.findCurrentCard(vehicle, now);
        if (card) currentCards.push(card);
    }

    const currentFuel = await exports.getFuelFactor({ region: settings.defaultRegion, product: "petrol", asOf: now });

    return { settings, currentCards, cards, fuel, currentFuel, adjustments };
};

exports.createRateCard = async ({ vehicleType, fuelProduct = "petrol", minFee, perKmRate, effectiveFrom }, actorId) => {
    if (!VEHICLE_KEYS.includes(vehicleType)) throw badRequest("Unknown vehicle type");
    if (!FUEL_PRODUCTS.includes(fuelProduct)) throw badRequest("Fuel product must be petrol or diesel");
    if (!(Number(minFee) >= 0) || !(Number(perKmRate) >= 0)) throw badRequest("Fees must be zero or more");

    const when = effectiveFrom ? new Date(effectiveFrom) : new Date();
    if (Number.isNaN(when.getTime())) throw badRequest("Invalid effective date");

    const id = await deliveryRatesRepository.insertCard({
        vehicleType, fuelProduct, minFee: Number(minFee), perKmRate: Number(perKmRate), effectiveFrom: when, createdBy: actorId
    });

    auditService.log({
        userId: actorId,
        eventType: "delivery_rate_card_created",
        description: `Rate card for ${vehicleType}: min ${minFee}, ${perKmRate}/km from ${when.toISOString()}`,
        metadata: { id, vehicleType, fuelProduct, minFee, perKmRate, effectiveFrom: when.toISOString() }
    });

    return id;
};

// Enters a monthly EWURA cap. If it moves more than the allowed monthly
// change versus the previous cap, it is still saved (it is the official
// number) but pricing uses the guard-railed value - the response says so.
exports.createFuelCap = async ({ region, product, capPrice, effectiveFrom }, actorId) => {
    if (!region || !String(region).trim()) throw badRequest("Region is required");
    if (!FUEL_PRODUCTS.includes(product)) throw badRequest("Fuel product must be petrol or diesel");
    if (!(Number(capPrice) > 0)) throw badRequest("Cap price must be greater than zero");

    const when = effectiveFrom ? new Date(effectiveFrom) : new Date();
    if (Number.isNaN(when.getTime())) throw badRequest("Invalid effective date");

    const id = await deliveryRatesRepository.insertFuel({
        region: String(region).trim(), product, capPrice: Number(capPrice), effectiveFrom: when, enteredBy: actorId
    });

    auditService.log({
        userId: actorId,
        eventType: "delivery_fuel_cap_entered",
        description: `EWURA ${product} cap for ${region}: ${capPrice} from ${when.toISOString()}`,
        metadata: { id, region, product, capPrice: Number(capPrice), effectiveFrom: when.toISOString() }
    });

    const applied = await exports.getFuelFactor({ region: String(region).trim(), product, asOf: when });
    return { id, limited: applied.limited, appliedCap: applied.cap, factor: applied.factor };
};

exports.updateSettings = async (data, actorId) => {
    const allowed = [
        "fuel_passthrough_pct", "fuel_baseline_cap", "fuel_max_monthly_change_pct",
        "delivery_handling_buffer_minutes", "default_delivery_vehicle", "delivery_default_region"
    ];
    const payload = Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key)));

    if (payload.default_delivery_vehicle !== undefined && !VEHICLE_KEYS.includes(payload.default_delivery_vehicle)) {
        throw badRequest("Unknown default vehicle");
    }
    if (payload.fuel_passthrough_pct !== undefined && !(Number(payload.fuel_passthrough_pct) >= 0 && Number(payload.fuel_passthrough_pct) <= 100)) {
        throw badRequest("Pass-through must be between 0 and 100");
    }
    if (payload.fuel_baseline_cap !== undefined && !(Number(payload.fuel_baseline_cap) > 0)) {
        throw badRequest("Baseline cap must be greater than zero");
    }
    if (payload.fuel_max_monthly_change_pct !== undefined && !(Number(payload.fuel_max_monthly_change_pct) >= 0 && Number(payload.fuel_max_monthly_change_pct) <= 100)) {
        throw badRequest("Monthly change limit must be between 0 and 100");
    }

    await settingsService.updateSettings(payload, { actorId });

    auditService.log({
        userId: actorId,
        eventType: "delivery_rate_settings_changed",
        description: "Delivery rate settings updated",
        metadata: payload
    });

    return settingsService.getDeliveryRateSettings();
};

const normalizeAdjustment = (data) => {
    const startHour = Number(data.startHour);
    const endHour = Number(data.endHour);
    const multiplier = Number(data.multiplier);
    const bufferMinutes = Number(data.bufferMinutes || 0);

    if (!data.region || !String(data.region).trim()) throw badRequest("Region is required");
    if (![startHour, endHour].every((h) => Number.isInteger(h) && h >= 0 && h <= 24)) throw badRequest("Hours must be whole numbers from 0 to 24");
    if (startHour === endHour) throw badRequest("Start and end hour must differ");
    if (!(multiplier >= 0.5 && multiplier <= 5)) throw badRequest("Multiplier must be between 0.5 and 5");
    if (!(Number.isInteger(bufferMinutes) && bufferMinutes >= 0 && bufferMinutes <= 240)) throw badRequest("Buffer must be 0-240 minutes");

    return {
        region: String(data.region).trim(),
        label: data.label ? String(data.label).trim().slice(0, 60) : null,
        startHour, endHour, multiplier, bufferMinutes,
        isActive: data.isActive !== false
    };
};

exports.createAdjustment = async (data, actorId) => {
    const row = normalizeAdjustment(data);
    const id = await deliveryRatesRepository.insertAdjustment(row);
    auditService.log({ userId: actorId, eventType: "delivery_eta_adjustment_changed", description: `ETA window added for ${row.region}`, metadata: { id, ...row } });
    return id;
};

exports.updateAdjustment = async (id, data, actorId) => {
    const existing = await deliveryRatesRepository.findAdjustmentById(id);
    if (!existing) {
        const error = new Error("ETA adjustment not found");
        error.status = 404;
        throw error;
    }
    const row = normalizeAdjustment(data);
    await deliveryRatesRepository.updateAdjustment(id, row);
    auditService.log({ userId: actorId, eventType: "delivery_eta_adjustment_changed", description: `ETA window ${id} updated`, metadata: { id, ...row } });
};

exports.deleteAdjustment = async (id, actorId) => {
    const existing = await deliveryRatesRepository.findAdjustmentById(id);
    if (!existing) {
        const error = new Error("ETA adjustment not found");
        error.status = 404;
        throw error;
    }
    await deliveryRatesRepository.deleteAdjustment(id);
    auditService.log({ userId: actorId, eventType: "delivery_eta_adjustment_changed", description: `ETA window ${id} removed`, metadata: { id, removed: true } });
};

// "A 7 km boda delivery costs X today" - same engine as real quotes.
exports.preview = async ({ distanceKm, vehicleType, region }) => {
    const km = Number(distanceKm);
    if (!(km > 0 && km <= 200)) throw badRequest("Distance must be between 0 and 200 km");

    const quote = await exports.quoteRiderPay({ distanceKm: km, vehicleType, region });
    if (quote) return { ...quote, distanceKm: km };

    const [bands, flat] = await Promise.all([settingsService.getDeliveryDistanceBands(), settingsService.getRiderDeliveryFee()]);
    const { computeBandedFee } = require("../../utils/deliveryPricing");
    return { fee: computeBandedFee(km, bands, flat), method: "bands", distanceKm: km };
};
