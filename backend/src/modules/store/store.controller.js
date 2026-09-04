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

// Phase 3 (UI/UX remediation) - backs the global search box's store
// suggestions. Always 200 with an array (possibly empty) for the same
// reasoning getStoreCollections above already documents for this kind
// of endpoint.
exports.search = async (req, res) => {
    try {
        const stores = await storeService.search(req.query);
        return res.status(200).json({ success: true, data: stores });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// Store follows (Phase 6, UI/UX remediation).
exports.follow = async (req, res) => {
    try {
        await storeService.follow(req.user.id, req.params.slug);
        return res.status(201).json({ success: true, message: "Following." });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.unfollow = async (req, res) => {
    try {
        await storeService.unfollow(req.user.id, req.params.slug);
        return res.status(200).json({ success: true, message: "Unfollowed." });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getFollowStatus = async (req, res) => {
    try {
        const status = await storeService.getFollowStatus(req.user.id, req.params.slug);
        return res.status(200).json({ success: true, data: status });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
