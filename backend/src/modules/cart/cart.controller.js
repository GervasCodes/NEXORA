const cartService = require("./cart.service");

exports.addToCart = async (req, res) => {
    try {
        const { product_id, quantity, variant_id } = req.body;

        const result = await cartService.addToCart(
            req.user.id,
            product_id,
            quantity || 1,
            variant_id || null
        );

        return res.status(201).json({
            success: true,
            message: "Item added to cart",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getCart = async (req, res) => {
    try {
        const result = await cartService.getCart(req.user.id);

        return res.json({
            success: true,
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.updateCartItem = async (req, res) => {
    try {
        const { productId, variantId } = req.params;
        const { quantity } = req.body;

        const result = await cartService.updateCartItem(
            req.user.id,
            productId,
            quantity,
            variantId || null
        );

        return res.json({
            success: true,
            message: "Cart item updated",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.removeFromCart = async (req, res) => {
    try {
        const { productId, variantId } = req.params;

        await cartService.removeFromCart(req.user.id, productId, variantId || null);

        return res.json({
            success: true,
            message: "Item removed from cart"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.clearCart = async (req, res) => {
    try {
        await cartService.clearCart(req.user.id);

        return res.json({
            success: true,
            message: "Cart cleared"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
