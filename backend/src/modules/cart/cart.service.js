const cartRepository = require("./cart.repository");

// Phase 2 continuation (UI/UX remediation) - variant_id threaded through.
// Every function accepts an optional variantId (null/undefined for the
// many products with no variants); cartRepository normalizes that to the
// 0 sentinel at the query boundary (see cart.repository.js's comment).

const assertValidVariant = async (product, variantId) => {
    if (!variantId) {
        if (product.has_variants) {
            // A product with variants configured has no meaningful
            // "default" stock/price of its own to sell - the buyer must
            // pick a combination first (enforced client-side too, see
            // ProductDetail.jsx's Add to Cart disabled state, but this
            // is the authoritative check).
            throw new Error("Please select an option before adding to cart");
        }
        return null;
    }

    const variant = await cartRepository.findVariantById(variantId);
    if (!variant || variant.product_id !== product.id) {
        throw new Error("This option is no longer available");
    }
    return variant;
};

// Add an item to the cart, or increase quantity if it's already there
exports.addToCart = async (userId, productId, quantity, variantId = null) => {
    const product = await cartRepository.findProductById(productId);

    if (!product) {
        throw new Error("Product not found");
    }

    if (product.is_active === 0) {
        throw new Error("This product is no longer available");
    }

    const variant = await assertValidVariant(product, variantId);
    const availableStock = variant ? variant.stock : product.stock;

    const existing = await cartRepository.findByUserAndProduct(userId, productId, variantId);

    const requestedQuantity = existing
        ? existing.quantity + quantity
        : quantity;

    if (requestedQuantity > availableStock) {
        throw new Error(`Only ${availableStock} item(s) left in stock`);
    }

    if (existing) {
        await cartRepository.updateQuantity(userId, productId, requestedQuantity, variantId);
    } else {
        await cartRepository.addItem(userId, productId, requestedQuantity, variantId);
    }

    return { productId, variantId: variantId || null, quantity: requestedQuantity };
};

// Set the quantity of an existing cart item directly
exports.updateCartItem = async (userId, productId, quantity, variantId = null) => {
    const existing = await cartRepository.findByUserAndProduct(userId, productId, variantId);

    if (!existing) {
        throw new Error("Item not found in cart");
    }

    const product = await cartRepository.findProductById(productId);
    const variant = variantId ? await cartRepository.findVariantById(variantId) : null;
    const availableStock = variant ? variant.stock : product.stock;

    if (quantity > availableStock) {
        throw new Error(`Only ${availableStock} item(s) left in stock`);
    }

    await cartRepository.updateQuantity(userId, productId, quantity, variantId);

    return { productId, variantId: variantId || null, quantity };
};

// Remove a single product (or specific variant of it) from the cart
exports.removeFromCart = async (userId, productId, variantId = null) => {
    const affectedRows = await cartRepository.removeItem(userId, productId, variantId);

    if (!affectedRows) {
        throw new Error("Item not found in cart");
    }
};

// Empty the whole cart
exports.clearCart = async (userId) => {
    await cartRepository.clearCart(userId);
};

// Get the cart with a computed total. A variant (when the line item has
// one) overrides the parent product's stock and contributes its
// price_delta on top of the product's own price/discount_price - this
// mirrors exactly how order.service.js#checkout prices a variant line
// item, so the cart total a buyer sees here matches what checkout
// actually charges.
exports.getCart = async (userId) => {
    const items = await cartRepository.getCartByUser(userId);

    const formattedItems = items.map((item) => {
        const hasVariant = Boolean(item.variant_id) && item.variant_options;
        const basePrice = Number(item.discount_price ?? item.price);
        const unitPrice = hasVariant ? basePrice + Number(item.variant_price_delta || 0) : basePrice;
        const stock = hasVariant ? item.variant_stock : item.product_stock;

        return {
            ...item,
            stock,
            unit_price: unitPrice,
            subtotal: Number((unitPrice * item.quantity).toFixed(2)),
            variant_options: hasVariant ? item.variant_options : null
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
