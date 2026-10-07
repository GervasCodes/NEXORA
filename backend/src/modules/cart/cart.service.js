const cartRepository = require("./cart.repository");
const businessService = require("../business/business.service");

// Per-line and per-cart quantity caps (Phase 3) - a sane ceiling with no
// product-specific configuration behind it yet (that would need its own
// admin/seller-facing setting - out of this phase's scope, flagged as a
// follow-up). High enough that no genuine bulk/B2B buyer should hit it in
// normal use, low enough to blunt an obvious cart-flooding/scripted abuse
// case.
const MAX_QUANTITY_PER_LINE = 500;
const MAX_CART_LINE_ITEMS = 100;

// continuation (UI/UX remediation) - variant_id threaded through.
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
    if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Quantity must be a positive number");
    }

    if (quantity > MAX_QUANTITY_PER_LINE) {
        throw new Error(`You can add at most ${MAX_QUANTITY_PER_LINE} of one item to your cart at a time`);
    }

    const product = await cartRepository.findProductById(productId);

    if (!product) {
        throw new Error("Product not found");
    }

    if (product.is_active === 0) {
        throw new Error("This product is no longer available");
    }

    // Seller-eligibility check (Phase 3) - same rule order.service.js's
    // checkout enforces: a suspended/deleted seller's products shouldn't
    // be addable to cart in the first place, not just blocked at the
    // checkout finish line (where the buyer has already built up a whole
    // cart expecting to be able to buy it).
    const activeSellerIds = await cartRepository.findActiveSellerIds([product.seller_id]);
    if (!activeSellerIds.length) {
        throw new Error("This product is no longer available - the seller's store isn't currently active");
    }

    const variant = await assertValidVariant(product, variantId);
    const availableStock = variant ? variant.stock : product.stock;

    if (availableStock <= 0) {
        throw new Error("This item is out of stock");
    }

    // Per-cart line-item cap (Phase 3) - checked before the write, not
    // after, so a buyer hitting the cap gets a clear reason rather than a
    // silent no-op; only matters for a genuinely NEW line (an existing
    // line incrementing doesn't add a new row).
    const existing = await cartRepository.findByUserAndProduct(userId, productId, variantId);
    if (!existing) {
        const currentLineCount = (await cartRepository.getCartByUser(userId)).length;
        if (currentLineCount >= MAX_CART_LINE_ITEMS) {
            throw new Error(`Your cart is full (max ${MAX_CART_LINE_ITEMS} different items) - remove something before adding more`);
        }
    }

    // Atomic add-to-cart (Phase 3, P1) - see
    // cartRepository.addOrIncrementItem's comment for why this replaced
    // the old read-then-write shape above. The stock cap is applied
    // server-side in the same statement, so the quantity actually written
    // is always accurate even if two adds race.
    const finalQuantity = await cartRepository.addOrIncrementItem(userId, productId, quantity, variantId, availableStock);

    if (finalQuantity < (existing ? existing.quantity + quantity : quantity)) {
        // The write capped it at stock - tell the buyer plainly rather
        // than silently returning less than they asked for.
        throw new Error(`Only ${availableStock} item(s) left in stock`);
    }

    return { productId, variantId: variantId || null, quantity: finalQuantity };
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
//
// Bulk/B2B tier pricing (Phase 3) - previously only applied at checkout,
// never shown here, so a buyer with a bulk-qualifying quantity in their
// cart saw a cart total that didn't match what they'd actually be charged
// a moment later at checkout. Resolved the same way checkout does: best
// eligible tier for THIS line's own quantity, falling back to the
// product's normal/discount price when no tier applies.
exports.getCart = async (userId) => {
    const items = await cartRepository.getCartByUser(userId);

    const productIds = [...new Set(items.map((item) => item.product_id))];
    const bulkUnitPriceByProduct = await businessService.getBulkUnitPrices(productIds, items);

    const formattedItems = items.map((item) => {
        const hasVariant = Boolean(item.variant_id) && item.variant_options;
        const bulkUnitPrice = bulkUnitPriceByProduct.get(item.product_id, item.quantity);
        const basePrice = bulkUnitPrice ?? Number(item.discount_price ?? item.price);
        const unitPrice = hasVariant ? Number((basePrice + Number(item.variant_price_delta || 0)).toFixed(2)) : basePrice;
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
