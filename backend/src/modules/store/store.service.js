const storeRepository = require("./store.repository");

exports.getPublicStoreProfile = async (slug) => {
    const store = await storeRepository.findPublicBySlug(slug);

    if (!store) {
        throw new Error("Store not found.");
    }

    return store;
};

// Phase 7C - Seller Collections. No "store not found" check here (unlike
// getPublicStoreProfile above): an unknown slug simply matches nothing in
// the JOIN and returns an empty array, which is exactly what a store with
// no collections yet should also return - the two cases don't need to be
// told apart, since the store page only renders this data when it already
// has a valid store profile loaded from the call above.
exports.getStoreCollections = async (slug) => {
    return storeRepository.findCollectionsBySlug(slug);
};
