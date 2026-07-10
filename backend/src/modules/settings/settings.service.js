const settingsRepository = require("./settings.repository");

// Fallbacks used only if the row is somehow missing (e.g. migration ran
// but the default INSERT was skipped) - keeps the platform functional
// instead of throwing mid-checkout.
const DEFAULTS = {
    commission_rate: "10",
    rider_delivery_fee: "3000"
};

exports.getAll = async () => {
    const rows = await settingsRepository.findAll();
    const map = { ...DEFAULTS };
    rows.forEach((row) => {
        map[row.setting_key] = row.setting_value;
    });
    return map;
};

// Platform's cut, as a percentage (e.g. 10 => 10%)
exports.getCommissionRate = async () => {
    const value = await settingsRepository.findByKey("commission_rate");
    return Number(value ?? DEFAULTS.commission_rate);
};

// Flat amount (TZS) paid to a delivery agent per completed delivery
exports.getRiderDeliveryFee = async () => {
    const value = await settingsRepository.findByKey("rider_delivery_fee");
    return Number(value ?? DEFAULTS.rider_delivery_fee);
};

exports.updateSettings = async (data) => {
    if (data.commission_rate !== undefined) {
        await settingsRepository.upsert("commission_rate", String(data.commission_rate));
    }
    if (data.rider_delivery_fee !== undefined) {
        await settingsRepository.upsert("rider_delivery_fee", String(data.rider_delivery_fee));
    }
    return exports.getAll();
};
