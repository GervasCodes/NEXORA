const productService = require("./product.service");
const { validationResult } = require("express-validator");

exports.createProduct = async (req, res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    try {
        const result = await productService.createProduct(
            req.user.id,
            req.body
        );

        return res.status(201).json({
            success: true,
            message: "Product created successfully",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.listProducts = async (req, res) => {
    try {
        const result = await productService.listProducts(req.query);

        return res.json({
            success: true,
            data: result.products,
            pagination: result.pagination
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.listFilterSellers = async (req, res) => {
    try {
        const sellers = await productService.listFilterSellers(req.query);

        return res.json({
            success: true,
            data: sellers
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.listFilterRegions = async (req, res) => {
    try {
        const regions = await productService.listFilterRegions(req.query);

        return res.json({
            success: true,
            data: regions
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getProductBySlug = async (req, res) => {
    try {
        const product = await productService.getProductBySlug(req.params.slug);

        return res.json({
            success: true,
            data: product
        });

    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

exports.uploadProductImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "An image file is required"
            });
        }

        const result = await productService.addProductImage(
            req.user.id,
            req.params.id,
            req.file,
            req.body.is_primary === "true"
        );

        return res.status(201).json({
            success: true,
            message: "Image uploaded",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.deleteProductImage = async (req, res) => {
    try {
        await productService.deleteProductImage(req.user.id, req.params.id, req.params.imageId);
        return res.json({ success: true, message: "Photo removed" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.setPrimaryProductImage = async (req, res) => {
    try {
        await productService.setPrimaryImage(req.user.id, req.params.id, req.params.imageId);
        return res.json({ success: true, message: "Primary photo updated" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.reorderProductImages = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
        await productService.reorderProductImages(req.user.id, req.params.id, req.body.ids);
        return res.json({ success: true, message: "Photo order updated" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.uploadProductVideo = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "A video file is required"
            });
        }

        const result = await productService.addProductVideo(
            req.user.id,
            req.params.id,
            req.file
        );

        return res.status(201).json({
            success: true,
            message: "Video uploaded",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.deleteProductVideo = async (req, res) => {
    try {
        await productService.deleteProductVideo(req.user.id, req.params.id, req.params.videoId);
        return res.json({ success: true, message: "Video removed" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.reorderProductVideos = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
        await productService.reorderProductVideos(req.user.id, req.params.id, req.body.ids);
        return res.json({ success: true, message: "Video order updated" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.uploadProductAudio = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "An audio file is required"
            });
        }

        const result = await productService.addProductAudio(
            req.user.id,
            req.params.id,
            req.file
        );

        return res.status(201).json({
            success: true,
            message: "Audio uploaded",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.deleteProductAudio = async (req, res) => {
    try {
        await productService.deleteProductAudio(req.user.id, req.params.id, req.params.audioId);
        return res.json({ success: true, message: "Audio removed" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.reorderProductAudio = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
        await productService.reorderProductAudio(req.user.id, req.params.id, req.body.ids);
        return res.json({ success: true, message: "Audio order updated" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getMyProducts = async (req, res) => {
    try {
        const result = await productService.getMyProducts(req.user.id, req.query);

        return res.json({
            success: true,
            data: result.products,
            pagination: result.pagination
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.bulkProductStatus = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    try {
        const result = await productService.bulkSetProductActiveBySeller(req.user.id, req.body.ids, req.body.is_active);

        return res.json({
            success: true,
            message: req.body.is_active ? "Products activated" : "Products deactivated",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getMyProductById = async (req, res) => {
    try {
        const product = await productService.getMyProductById(req.user.id, req.params.id);

        return res.json({
            success: true,
            data: product
        });

    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const product = await productService.updateProduct(
            req.user.id,
            req.params.id,
            req.body
        );

        return res.json({
            success: true,
            message: "Product updated",
            data: product
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.deactivateMyProduct = async (req, res) => {
    try {
        await productService.setProductActiveBySeller(req.user.id, req.params.id, false);

        return res.json({ success: true, message: "Product deactivated" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.activateMyProduct = async (req, res) => {
    try {
        await productService.setProductActiveBySeller(req.user.id, req.params.id, true);

        return res.json({ success: true, message: "Product activated" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
