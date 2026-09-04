const buyerAddressRepository = require("./buyerAddress.repository");

exports.list = async (userId) => buyerAddressRepository.findByUser(userId);

// The buyer's first-ever saved address becomes their default
// automatically - otherwise checkout's "pick a saved address" selector
// would have nothing pre-selected the very first time it has anything
// to show, which defeats the point of saving one at all.
exports.create = async (userId, payload) => {
    const existingCount = await buyerAddressRepository.countByUser(userId);
    const makeDefault = existingCount === 0 || Boolean(payload.is_default);

    if (makeDefault && existingCount > 0) {
        await buyerAddressRepository.clearDefault(userId);
    }

    const id = await buyerAddressRepository.create(userId, {
        ...payload,
        is_default: makeDefault
    });

    return buyerAddressRepository.findById(id, userId);
};

exports.update = async (id, userId, payload) => {
    const existing = await buyerAddressRepository.findById(id, userId);
    if (!existing) {
        throw new Error("Address not found");
    }

    await buyerAddressRepository.update(id, userId, payload);
    return buyerAddressRepository.findById(id, userId);
};

exports.remove = async (id, userId) => {
    const existing = await buyerAddressRepository.findById(id, userId);
    if (!existing) {
        throw new Error("Address not found");
    }

    const affectedRows = await buyerAddressRepository.remove(id, userId);

    // If the deleted address was the default and other addresses remain,
    // promote the most recently saved one so the buyer never ends up
    // with saved addresses but no default - checkout's selector always
    // needs something pre-selected.
    if (existing.is_default) {
        const remaining = await buyerAddressRepository.findByUser(userId);
        if (remaining.length > 0) {
            await buyerAddressRepository.setDefault(remaining[0].id, userId);
        }
    }

    return affectedRows;
};

exports.setDefault = async (id, userId) => {
    const existing = await buyerAddressRepository.findById(id, userId);
    if (!existing) {
        throw new Error("Address not found");
    }

    await buyerAddressRepository.clearDefault(userId);
    await buyerAddressRepository.setDefault(id, userId);

    return buyerAddressRepository.findById(id, userId);
};

// Used by order.service.js#checkout when the buyer picked a saved
// address (address_id) instead of typing a fresh one - returns the
// fields checkout needs, or throws if it doesn't belong to this buyer
// (same "not found" shape whether it's missing or someone else's, so
// this never leaks whether an address ID exists for another account).
exports.assertOwnedAndGet = async (id, userId) => {
    const address = await buyerAddressRepository.findById(id, userId);
    if (!address) {
        throw new Error("Saved address not found");
    }
    return address;
};
