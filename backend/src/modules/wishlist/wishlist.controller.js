const wishlistService = require("./wishlist.service");

// Products (unchanged endpoints/behavior from before Phase 5 - existing
// frontend calls to these keep working exactly as they did).
exports.getSaved = async (req, res) => {
    try {
        const items = await wishlistService.getSavedProducts(req.user.id);
        res.json({ success: true, data: items });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.add = async (req, res) => {
    try {
        await wishlistService.addProduct(req.user.id, req.params.productId);
        res.status(201).json({ success: true, message: "Saved." });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.remove = async (req, res) => {
    try {
        await wishlistService.removeProduct(req.user.id, req.params.productId);
        res.json({ success: true, message: "Removed." });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// Services (Phase 5, UI/UX remediation - new).
exports.getSavedServices = async (req, res) => {
    try {
        const items = await wishlistService.getSavedServices(req.user.id);
        res.json({ success: true, data: items });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.addService = async (req, res) => {
    try {
        await wishlistService.addService(req.user.id, req.params.serviceId);
        res.status(201).json({ success: true, message: "Saved." });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.removeService = async (req, res) => {
    try {
        await wishlistService.removeService(req.user.id, req.params.serviceId);
        res.json({ success: true, message: "Removed." });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// Ids (Phase 5) - now returns both lists in one call; the response
// shape changed from a flat product-id array to { productIds,
// serviceIds } - WishlistContext.jsx is updated in the same phase to
// match, since nothing else in the frontend calls this endpoint
// directly.
exports.getIds = async (req, res) => {
    try {
        const ids = await wishlistService.getIds(req.user.id);
        res.json({ success: true, data: ids });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
