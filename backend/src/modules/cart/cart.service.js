const cartRepository = require("./cart.repository");

// Add an item to the cart, or increase quantity if it's already there
exports.addToCart = async (userId, productId, quantity) => {
    const product = await cartRepository.findProductById(productId);

    if (!product) {
        throw new Error("Product not found");
    }

    if (product.is_active === 0) {
        throw new Error("This product is no longer available");
    }

    const existing = await cartRepository.findByUserAndProduct(
        userId,
        productId
    );

    const requestedQuantity = existing
        ? existing.quantity + quantity
        : quantity;

    if (requestedQuantity > product.stock) {
        throw new Error(`Only ${product.stock} item(s) left in stock`);
    }

    if (existing) {
        await cartRepository.updateQuantity(
            userId,
            productId,
            requestedQuantity
        );
    } else {
        await cartRepository.addItem(userId, productId, requestedQuantity);
    }

    return { productId, quantity: requestedQuantity };
};

// Set the quantity of an existing cart item directly
exports.updateCartItem = async (userId, productId, quantity) => {
    const existing = await cartRepository.findByUserAndProduct(
        userId,
        productId
    );

    if (!existing) {
        throw new Error("Item not found in cart");
    }

    const product = await cartRepository.findProductById(productId);

    if (quantity > product.stock) {
        throw new Error(`Only ${product.stock} item(s) left in stock`);
    }

    await cartRepository.updateQuantity(userId, productId, quantity);

    return { productId, quantity };
};

// Remove a single product from the cart
exports.removeFromCart = async (userId, productId) => {
    const affectedRows = await cartRepository.removeItem(userId, productId);

    if (!affectedRows) {
        throw new Error("Item not found in cart");
    }
};

// Empty the whole cart
exports.clearCart = async (userId) => {
    await cartRepository.clearCart(userId);
};

// Get the cart with a computed total
exports.getCart = async (userId) => {
    const items = await cartRepository.getCartByUser(userId);

    const formattedItems = items.map((item) => {
        const unitPrice = item.discount_price ?? item.price;
        return {
            ...item,
            unit_price: unitPrice,
            subtotal: Number((unitPrice * item.quantity).toFixed(2))
        };
    });

    const total = Number(
        formattedItems
            .reduce((sum, item) => sum + item.subtotal, 0)
            .toFixed(2)
    );

    return {
        items: formattedItems,
        total
    };
};
