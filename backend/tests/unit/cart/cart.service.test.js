jest.mock("../../../src/modules/cart/cart.repository");
jest.mock("../../../src/modules/business/business.service");

const cartRepository = require("../../../src/modules/cart/cart.repository");
const businessService = require("../../../src/modules/business/business.service");
const cartService = require("../../../src/modules/cart/cart.service");

// A product row in the shape cart.repository#findProductById returns. It must
// carry seller_id: addToCart uses it for the seller-eligibility check.
const productRow = (overrides = {}) => ({
    id: 5, seller_id: 10, price: 1000, discount_price: null, stock: 10, is_active: 1, has_variants: 0,
    ...overrides
});

beforeEach(() => {
    // Every seller is active unless a test says otherwise.
    cartRepository.findActiveSellerIds.mockImplementation(async (sellerIds) => sellerIds);
    // Not in the cart yet, empty cart, and the atomic write reports exactly
    // what was requested (i.e. no stock capping) unless a test says otherwise.
    cartRepository.findByUserAndProduct.mockResolvedValue(undefined);
    cartRepository.getCartByUser.mockResolvedValue([]);
    cartRepository.addOrIncrementItem.mockImplementation(async (_userId, _productId, quantity) => quantity);
    // No bulk tier applies to anything.
    businessService.getBulkUnitPrices.mockResolvedValue({ get: () => null });
});

describe("cart.service.addToCart - validation", () => {
    it.each([0, -1, NaN, Infinity])("rejects a non-positive or non-finite quantity (%p) before touching the database", async (quantity) => {
        await expect(cartService.addToCart(1, 5, quantity)).rejects.toThrow("Quantity must be a positive number");

        expect(cartRepository.findProductById).not.toHaveBeenCalled();
        expect(cartRepository.addOrIncrementItem).not.toHaveBeenCalled();
    });

    it("rejects a quantity above the per-line cap, and allows exactly the cap", async () => {
        await expect(cartService.addToCart(1, 5, 501)).rejects.toThrow("at most 500 of one item");
        expect(cartRepository.findProductById).not.toHaveBeenCalled();

        cartRepository.findProductById.mockResolvedValue(productRow({ stock: 1000 }));
        await expect(cartService.addToCart(1, 5, 500)).resolves.toEqual({ productId: 5, variantId: null, quantity: 500 });
    });

    it("rejects an unknown product", async () => {
        cartRepository.findProductById.mockResolvedValue(undefined);

        await expect(cartService.addToCart(1, 5, 1)).rejects.toThrow("Product not found");
        expect(cartRepository.addOrIncrementItem).not.toHaveBeenCalled();
    });

    it("rejects a deactivated product", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow({ is_active: 0 }));

        await expect(cartService.addToCart(1, 5, 1)).rejects.toThrow("This product is no longer available");
        expect(cartRepository.addOrIncrementItem).not.toHaveBeenCalled();
    });

    it("rejects a product whose seller is suspended or deleted, checking exactly that product's seller", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow({ seller_id: 42 }));
        cartRepository.findActiveSellerIds.mockResolvedValue([]);

        await expect(cartService.addToCart(1, 5, 1)).rejects.toThrow("seller's store isn't currently active");

        expect(cartRepository.findActiveSellerIds).toHaveBeenCalledWith([42]);
        expect(cartRepository.addOrIncrementItem).not.toHaveBeenCalled();
    });

    it("rejects an out-of-stock product", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow({ stock: 0 }));

        await expect(cartService.addToCart(1, 5, 1)).rejects.toThrow("This item is out of stock");
        expect(cartRepository.addOrIncrementItem).not.toHaveBeenCalled();
    });
});

describe("cart.service.addToCart - variants", () => {
    it("requires an option to be chosen when the product has variants", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow({ has_variants: 1 }));

        await expect(cartService.addToCart(1, 5, 1)).rejects.toThrow("Please select an option before adding to cart");
        expect(cartRepository.addOrIncrementItem).not.toHaveBeenCalled();
    });

    it("rejects a variant that doesn't exist (or is inactive)", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow({ has_variants: 1 }));
        cartRepository.findVariantById.mockResolvedValue(undefined);

        await expect(cartService.addToCart(1, 5, 1, 7)).rejects.toThrow("This option is no longer available");
        expect(cartRepository.addOrIncrementItem).not.toHaveBeenCalled();
    });

    it("rejects a variant that belongs to a different product", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow({ has_variants: 1 }));
        cartRepository.findVariantById.mockResolvedValue({ id: 7, product_id: 999, stock: 5 });

        await expect(cartService.addToCart(1, 5, 1, 7)).rejects.toThrow("This option is no longer available");
        expect(cartRepository.addOrIncrementItem).not.toHaveBeenCalled();
    });

    it("uses the variant's own stock - not the parent product's - for the out-of-stock check", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow({ has_variants: 1, stock: 50 }));
        cartRepository.findVariantById.mockResolvedValue({ id: 7, product_id: 5, stock: 0 });

        await expect(cartService.addToCart(1, 5, 1, 7)).rejects.toThrow("This item is out of stock");
    });

    it("adds a variant line, capping at the variant's stock and returning the variant id", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow({ has_variants: 1, stock: 50 }));
        cartRepository.findVariantById.mockResolvedValue({ id: 7, product_id: 5, stock: 4 });

        const result = await cartService.addToCart(1, 5, 2, 7);

        expect(cartRepository.findByUserAndProduct).toHaveBeenCalledWith(1, 5, 7);
        expect(cartRepository.addOrIncrementItem).toHaveBeenCalledWith(1, 5, 2, 7, 4);
        expect(result).toEqual({ productId: 5, variantId: 7, quantity: 2 });
    });
});

describe("cart.service.addToCart - atomic add / increment", () => {
    it("adds a new line through the single atomic write, passing the available stock as the cap", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow({ stock: 10 }));

        const result = await cartService.addToCart(1, 5, 3);

        expect(cartRepository.addOrIncrementItem).toHaveBeenCalledTimes(1);
        expect(cartRepository.addOrIncrementItem).toHaveBeenCalledWith(1, 5, 3, null, 10);
        expect(result).toEqual({ productId: 5, variantId: null, quantity: 3 });
    });

    it("no longer does a separate read-modify-write (no addItem / updateQuantity from addToCart)", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow());
        cartRepository.findByUserAndProduct.mockResolvedValue({ quantity: 2 });
        cartRepository.addOrIncrementItem.mockResolvedValue(5);

        await cartService.addToCart(1, 5, 3);

        expect(cartRepository.addItem).not.toHaveBeenCalled();
        expect(cartRepository.updateQuantity).not.toHaveBeenCalled();
    });

    it("reports the quantity the repository says is now in the cart when adding to an existing line", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow({ stock: 10 }));
        cartRepository.findByUserAndProduct.mockResolvedValue({ quantity: 2 });
        cartRepository.addOrIncrementItem.mockResolvedValue(5);

        const result = await cartService.addToCart(1, 5, 3);

        expect(cartRepository.addOrIncrementItem).toHaveBeenCalledWith(1, 5, 3, null, 10);
        expect(result).toEqual({ productId: 5, variantId: null, quantity: 5 });
    });

    it("rejects when the write capped an existing line's combined quantity at stock", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow({ stock: 4 }));
        cartRepository.findByUserAndProduct.mockResolvedValue({ quantity: 2 });
        cartRepository.addOrIncrementItem.mockResolvedValue(4); // 2 + 3 = 5 asked for, capped at 4

        await expect(cartService.addToCart(1, 5, 3)).rejects.toThrow("Only 4 item(s) left in stock");
    });

    it("rejects when the write capped a brand-new line below the requested quantity", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow({ stock: 2 }));
        cartRepository.addOrIncrementItem.mockResolvedValue(2); // asked for 3

        await expect(cartService.addToCart(1, 5, 3)).rejects.toThrow("Only 2 item(s) left in stock");
    });

    it("accepts an add that lands exactly on the stock level", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow({ stock: 5 }));
        cartRepository.findByUserAndProduct.mockResolvedValue({ quantity: 2 });
        cartRepository.addOrIncrementItem.mockResolvedValue(5);

        await expect(cartService.addToCart(1, 5, 3)).resolves.toEqual({ productId: 5, variantId: null, quantity: 5 });
    });
});

describe("cart.service.addToCart - cart line-item cap", () => {
    const fullCart = () => Array.from({ length: 100 }, (_, i) => ({ cart_item_id: i + 1, product_id: i + 100 }));

    it("rejects a NEW line when the cart already holds the maximum number of lines", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow());
        cartRepository.getCartByUser.mockResolvedValue(fullCart());

        await expect(cartService.addToCart(1, 5, 1)).rejects.toThrow("Your cart is full (max 100 different items)");
        expect(cartRepository.addOrIncrementItem).not.toHaveBeenCalled();
    });

    it("still allows adding to a line that's already in a full cart (it isn't a new row)", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow());
        cartRepository.findByUserAndProduct.mockResolvedValue({ quantity: 1 });
        cartRepository.getCartByUser.mockResolvedValue(fullCart());
        cartRepository.addOrIncrementItem.mockResolvedValue(2);

        await expect(cartService.addToCart(1, 5, 1)).resolves.toEqual({ productId: 5, variantId: null, quantity: 2 });
        expect(cartRepository.getCartByUser).not.toHaveBeenCalled();
    });

    it("allows a new line when the cart is one below the maximum", async () => {
        cartRepository.findProductById.mockResolvedValue(productRow());
        cartRepository.getCartByUser.mockResolvedValue(fullCart().slice(0, 99));

        await expect(cartService.addToCart(1, 5, 1)).resolves.toEqual({ productId: 5, variantId: null, quantity: 1 });
    });
});

describe("cart.service.updateCartItem", () => {
    it("rejects when the item isn't already in the cart", async () => {
        cartRepository.findByUserAndProduct.mockResolvedValue(undefined);

        await expect(cartService.updateCartItem(1, 5, 2)).rejects.toThrow("Item not found in cart");
        expect(cartRepository.findProductById).not.toHaveBeenCalled();
    });

    it("rejects a quantity above current stock", async () => {
        cartRepository.findByUserAndProduct.mockResolvedValue({ quantity: 1 });
        cartRepository.findProductById.mockResolvedValue(productRow({ stock: 3 }));

        await expect(cartService.updateCartItem(1, 5, 4)).rejects.toThrow("Only 3 item(s) left in stock");
        expect(cartRepository.updateQuantity).not.toHaveBeenCalled();
    });

    it("sets the quantity directly (not additive, unlike addToCart)", async () => {
        cartRepository.findByUserAndProduct.mockResolvedValue({ quantity: 1 });
        cartRepository.findProductById.mockResolvedValue(productRow({ stock: 10 }));

        const result = await cartService.updateCartItem(1, 5, 4);

        expect(cartRepository.updateQuantity).toHaveBeenCalledWith(1, 5, 4, null);
        expect(cartRepository.addOrIncrementItem).not.toHaveBeenCalled();
        expect(result).toEqual({ productId: 5, variantId: null, quantity: 4 });
    });

    it("checks a variant line against the variant's stock, not the product's", async () => {
        cartRepository.findByUserAndProduct.mockResolvedValue({ quantity: 1 });
        cartRepository.findProductById.mockResolvedValue(productRow({ stock: 50 }));
        cartRepository.findVariantById.mockResolvedValue({ id: 7, product_id: 5, stock: 2 });

        await expect(cartService.updateCartItem(1, 5, 3, 7)).rejects.toThrow("Only 2 item(s) left in stock");

        await expect(cartService.updateCartItem(1, 5, 2, 7)).resolves.toEqual({ productId: 5, variantId: 7, quantity: 2 });
        expect(cartRepository.updateQuantity).toHaveBeenCalledWith(1, 5, 2, 7);
    });
});

describe("cart.service.removeFromCart", () => {
    it("rejects when nothing was removed", async () => {
        cartRepository.removeItem.mockResolvedValue(0);

        await expect(cartService.removeFromCart(1, 5)).rejects.toThrow("Item not found in cart");
    });

    it("succeeds when a row was removed, passing the variant through", async () => {
        cartRepository.removeItem.mockResolvedValue(1);

        await expect(cartService.removeFromCart(1, 5, 7)).resolves.toBeUndefined();
        expect(cartRepository.removeItem).toHaveBeenCalledWith(1, 5, 7);
    });
});

describe("cart.service.clearCart", () => {
    it("delegates to the repository", async () => {
        await cartService.clearCart(1);
        expect(cartRepository.clearCart).toHaveBeenCalledWith(1);
    });
});

describe("cart.service.getCart", () => {
    it("returns an empty cart with a zero total", async () => {
        cartRepository.getCartByUser.mockResolvedValue([]);

        const result = await cartService.getCart(1);

        expect(result).toEqual({ items: [], total: 0 });
    });

    it("prefers discount_price over price per line and sums to the correct total", async () => {
        cartRepository.getCartByUser.mockResolvedValue([
            { product_id: 1, price: 1000, discount_price: 800, quantity: 2, product_stock: 9 },
            { product_id: 2, price: 500, discount_price: null, quantity: 3, product_stock: 9 }
        ]);

        const result = await cartService.getCart(1);

        expect(result.items[0]).toEqual(expect.objectContaining({ unit_price: 800, subtotal: 1600 }));
        expect(result.items[1]).toEqual(expect.objectContaining({ unit_price: 500, subtotal: 1500 }));
        expect(result.total).toBe(3100);
    });

    it("looks up bulk tiers once for the distinct products, passing the cart lines along", async () => {
        const rows = [
            { product_id: 1, price: 100, discount_price: null, quantity: 1, product_stock: 5 },
            { product_id: 1, variant_id: 3, variant_options: "{}", price: 100, discount_price: null, quantity: 2, product_stock: 5, variant_stock: 5 },
            { product_id: 2, price: 100, discount_price: null, quantity: 1, product_stock: 5 }
        ];
        cartRepository.getCartByUser.mockResolvedValue(rows);

        await cartService.getCart(1);

        expect(businessService.getBulkUnitPrices).toHaveBeenCalledTimes(1);
        expect(businessService.getBulkUnitPrices).toHaveBeenCalledWith([1, 2], rows);
    });

    it("applies a bulk tier price for the line's own quantity, matching what checkout charges", async () => {
        cartRepository.getCartByUser.mockResolvedValue([
            { product_id: 1, price: 1000, discount_price: 900, quantity: 50, product_stock: 100 },
            { product_id: 2, price: 500, discount_price: null, quantity: 2, product_stock: 100 }
        ]);
        businessService.getBulkUnitPrices.mockResolvedValue({
            get: (productId, quantity) => (productId === 1 && quantity === 50 ? 700 : null)
        });

        const result = await cartService.getCart(1);

        expect(result.items[0]).toEqual(expect.objectContaining({ unit_price: 700, subtotal: 35000 }));
        expect(result.items[1]).toEqual(expect.objectContaining({ unit_price: 500, subtotal: 1000 }));
        expect(result.total).toBe(36000);
    });

    it("uses the product's stock for a plain line and nulls out variant_options", async () => {
        cartRepository.getCartByUser.mockResolvedValue([
            { product_id: 1, variant_id: 0, variant_options: null, price: 100, discount_price: null, quantity: 1, product_stock: 8 }
        ]);

        const result = await cartService.getCart(1);

        expect(result.items[0]).toEqual(expect.objectContaining({ stock: 8, variant_options: null }));
    });

    it("prices a variant line as base price + the variant's price_delta, and takes stock from the variant", async () => {
        cartRepository.getCartByUser.mockResolvedValue([
            {
                product_id: 1, variant_id: 7, variant_options: { size: "L" }, variant_price_delta: 150.5, variant_stock: 3,
                price: 1000, discount_price: 800, quantity: 2, product_stock: 50
            }
        ]);

        const result = await cartService.getCart(1);

        expect(result.items[0]).toEqual(expect.objectContaining({
            stock: 3, unit_price: 950.5, subtotal: 1901, variant_options: { size: "L" }
        }));
        expect(result.total).toBe(1901);
    });

    it("adds the variant's price_delta on top of a bulk tier price too", async () => {
        cartRepository.getCartByUser.mockResolvedValue([
            { product_id: 1, variant_id: 7, variant_options: { size: "L" }, variant_price_delta: 100, variant_stock: 99, price: 1000, discount_price: null, quantity: 20, product_stock: 99 }
        ]);
        businessService.getBulkUnitPrices.mockResolvedValue({ get: () => 600 });

        const result = await cartService.getCart(1);

        expect(result.items[0]).toEqual(expect.objectContaining({ unit_price: 700, subtotal: 14000 }));
    });

    it("rounds a fractional subtotal and total to two decimals", async () => {
        cartRepository.getCartByUser.mockResolvedValue([
            { product_id: 1, price: 10.1, discount_price: null, quantity: 3, product_stock: 9 },
            { product_id: 2, price: 0.2, discount_price: null, quantity: 3, product_stock: 9 }
        ]);

        const result = await cartService.getCart(1);

        expect(result.items[0].subtotal).toBe(30.3);
        expect(result.items[1].subtotal).toBe(0.6);
        expect(result.total).toBe(30.9);
    });
});
