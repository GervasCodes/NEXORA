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

exports.getMyProducts = async (req, res) => {
    try {
        const products = await productService.getMyProducts(req.user.id);

        return res.json({
            success: true,
            data: products
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
