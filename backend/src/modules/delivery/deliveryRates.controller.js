const deliveryRatesService = require("./deliveryRates.service");

const respond = (handler) => async (req, res) => {
    try {
        const data = await handler(req);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(error.status || 400).json({ success: false, message: error.message });
    }
};

const adjustmentFromBody = (b) => ({
    region: b.region,
    label: b.label,
    startHour: b.start_hour,
    endHour: b.end_hour,
    multiplier: b.multiplier,
    bufferMinutes: b.buffer_minutes,
    isActive: b.is_active !== false && b.is_active !== "false"
});

exports.getOverview = respond(() => deliveryRatesService.getOverview());

exports.preview = respond((req) => deliveryRatesService.preview({
    distanceKm: req.query.distance_km,
    vehicleType: req.query.vehicle,
    region: req.query.region
}));

exports.createCard = respond(async (req) => ({
    id: await deliveryRatesService.createRateCard({
        vehicleType: req.body.vehicle_type,
        fuelProduct: req.body.fuel_product,
        minFee: req.body.min_fee,
        perKmRate: req.body.per_km_rate,
        effectiveFrom: req.body.effective_from
    }, req.user.id)
}));

exports.createFuel = respond((req) => deliveryRatesService.createFuelCap({
    region: req.body.region,
    product: req.body.product,
    capPrice: req.body.cap_price,
    effectiveFrom: req.body.effective_from
}, req.user.id));

exports.updateSettings = respond((req) => deliveryRatesService.updateSettings(req.body, req.user.id));

exports.createAdjustment = respond(async (req) => ({
    id: await deliveryRatesService.createAdjustment(adjustmentFromBody(req.body), req.user.id)
}));

exports.updateAdjustment = respond(async (req) => {
    await deliveryRatesService.updateAdjustment(Number(req.params.id), adjustmentFromBody(req.body), req.user.id);
    return { id: Number(req.params.id) };
});

exports.deleteAdjustment = respond(async (req) => {
    await deliveryRatesService.deleteAdjustment(Number(req.params.id), req.user.id);
    return { id: Number(req.params.id) };
});
