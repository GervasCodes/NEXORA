const pickupPointRepository = require("./pickupPoint.repository");

exports.listActive = async (filter) => pickupPointRepository.findActive(filter);

exports.listAll = async () => pickupPointRepository.findAll();

exports.getById = async (id) => pickupPointRepository.findById(id);

exports.create = async (data) => {
    if (!data.name || !data.address || !data.city || !data.region) {
        throw new Error("Name, address, city, and region are required");
    }
    const id = await pickupPointRepository.create(data);
    return pickupPointRepository.findById(id);
};

exports.update = async (id, fields) => {
    const existing = await pickupPointRepository.findById(id);
    if (!existing) throw new Error("Pickup point not found");
    await pickupPointRepository.update(id, fields);
    return pickupPointRepository.findById(id);
};

// Called from order.service.js#checkout - validates the buyer's chosen
// pickup point is real/active and returns the address fields to
// substitute in for shippingInfo's own address (the delivery agent
// routes to the pickup point, not the buyer's home - see migration
// 087's header comment).
exports.assertActiveAndGetAddress = async (pickupPointId) => {
    const point = await pickupPointRepository.findById(pickupPointId);
    if (!point || !point.is_active) {
        throw new Error("This pickup point is no longer available - please choose another or use home delivery");
    }
    return point;
};
