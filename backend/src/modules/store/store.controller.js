const storeService = require("./store.service");

// Public store profile by slug - no auth, same pattern as
// product.controller's getBySlug (product detail page).
exports.getStoreProfile = async (req, res) => {
    try {
        const store = await storeService.getPublicStoreProfile(req.params.slug);

        return res.status(200).json({
            success: true,
            data: store
        });
    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

// Phase 7C - Seller Collections. Public, no auth - same as getStoreProfile
// above. Always 200 with an array (possibly empty), never 404 - see
// store.service's comment on why an unknown slug and a valid slug with
// no collections don't need to be told apart here.
exports.getStoreCollections = async (req, res) => {
    try {
        const collections = await storeService.getStoreCollections(req.params.slug);

        return res.status(200).json({
            success: true,
            data: collections
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
