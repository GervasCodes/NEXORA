jest.mock("../../../src/modules/cart/cart.repository");

const cartRepository = require("../../../src/modules/cart/cart.repository");
const cartService = require("../../../src/modules/cart/cart.service");

describe("cart.service.addToCart", () => {
    it("rejects an unknown product", async () => {
        cartRepository.findProductById.mockResolvedValue(undefined);

        await expect(cartService.addToCart(1, 5, 1)).rejects.toThrow("Product not found");
    });

    it("rejects a deactivated product", async () => {
        cartRepository.findProductById.mockResolvedValue({ id: 5, stock: 10, is_active: 0 });

        await expect(cartService.addToCart(1, 5, 1)).rejects.toThrow("This product is no longer available");
    });

    it("adds a new item when none exists yet", async () => {
        cartRepository.findProductById.mockResolvedValue({ id: 5, stock: 10, is_active: 1 });
        cartRepository.findByUserAndProduct.mockResolvedValue(undefined);

        const result = await cartService.addToCart(1, 5, 3);

        expect(cartRepository.addItem).toHaveBeenCalledWith(1, 5, 3);
        expect(cartRepository.updateQuantity).not.toHaveBeenCalled();
        expect(result).toEqual({ productId: 5, quantity: 3 });
    });

    it("adds to the existing quantity rather than overwriting it", async () => {
        cartRepository.findProductById.mockResolvedValue({ id: 5, stock: 10, is_active: 1 });
        cartRepository.findByUserAndProduct.mockResolvedValue({ quantity: 2 });

        const result = await cartService.addToCart(1, 5, 3);

        expect(cartRepository.updateQuantity).toHaveBeenCalledWith(1, 5, 5);
        expect(cartRepository.addItem).not.toHaveBeenCalled();
        expect(result).toEqual({ productId: 5, quantity: 5 });
    });

    it("rejects when the combined quantity exceeds stock", async () => {
        cartRepository.findProductById.mockResolvedValue({ id: 5, stock: 4, is_active: 1 });
        cartRepository.findByUserAndProduct.mockResolvedValue({ quantity: 2 });

        await expect(cartService.addToCart(1, 5, 3)).rejects.toThrow("Only 4 item(s) left in stock");
        expect(cartRepository.addItem).not.toHaveBeenCalled();
        expect(cartRepository.updateQuantity).not.toHaveBeenCalled();
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
        cartRepository.findProductById.mockResolvedValue({ stock: 3 });

        await expect(cartService.updateCartItem(1, 5, 4)).rejects.toThrow("Only 3 item(s) left in stock");
        expect(cartRepository.updateQuantity).not.toHaveBeenCalled();
    });

    it("sets the quantity directly (not additive, unlike addToCart)", async () => {
        cartRepository.findByUserAndProduct.mockResolvedValue({ quantity: 1 });
        cartRepository.findProductById.mockResolvedValue({ stock: 10 });

        const result = await cartService.updateCartItem(1, 5, 4);

        expect(cartRepository.updateQuantity).toHaveBeenCalledWith(1, 5, 4);
        expect(result).toEqual({ productId: 5, quantity: 4 });
    });
});

describe("cart.service.removeFromCart", () => {
    it("rejects when nothing was removed", async () => {
        cartRepository.removeItem.mockResolvedValue(0);

        await expect(cartService.removeFromCart(1, 5)).rejects.toThrow("Item not found in cart");
    });

    it("succeeds when a row was removed", async () => {
        cartRepository.removeItem.mockResolvedValue(1);

        await expect(cartService.removeFromCart(1, 5)).resolves.toBeUndefined();
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
            { product_id: 1, price: 1000, discount_price: 800, quantity: 2 },
            { product_id: 2, price: 500, discount_price: null, quantity: 3 }
        ]);

        const result = await cartService.getCart(1);

        expect(result.items[0]).toEqual(
            expect.objectContaining({ unit_price: 800, subtotal: 1600 })
        );
        expect(result.items[1]).toEqual(
            expect.objectContaining({ unit_price: 500, subtotal: 1500 })
        );
        expect(result.total).toBe(3100);
    });
});
