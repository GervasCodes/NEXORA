import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return { ...actual, useNavigate: () => mockNavigate };
});

const mockUseCart = vi.fn();
vi.mock("../../src/context/CartContext", () => ({
    useCart: () => mockUseCart()
}));

vi.mock("../../src/context/CurrencyContext", () => ({
    useCurrency: () => ({ format: (amount) => `TZS ${amount}` })
}));

vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({
        t: (key) => ({
            "cart.empty": "Your cart is empty",
            "cart.title": "Your Cart",
            "cart.checkoutButton": "Checkout",
            "common.browseMarketplace": "Browse the marketplace",
            "common.each": "each",
            "common.total": "Total",
            "common.remove": "Remove"
        }[key] || key)
    })
}));

import Cart from "../../src/pages/Cart";

const renderCart = () => render(<MemoryRouter><Cart /></MemoryRouter>);

const baseCart = {
    items: [],
    total: 0,
    loading: false,
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn()
};

beforeEach(() => {
    mockNavigate.mockClear();
    mockUseCart.mockReset();
    baseCart.updateQuantity.mockClear();
    baseCart.removeFromCart.mockClear();
});

describe("Cart page", () => {
    it("shows a loading skeleton while the cart is loading", () => {
        mockUseCart.mockReturnValue({ ...baseCart, loading: true });

        renderCart();

        expect(screen.queryByText("Your Cart")).not.toBeInTheDocument();
        expect(screen.queryByText("Your cart is empty")).not.toBeInTheDocument();
    });

    it("shows an empty state with a link back to the marketplace when there are no items", () => {
        mockUseCart.mockReturnValue({ ...baseCart, items: [] });

        renderCart();

        expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
        expect(screen.getByText("Browse the marketplace")).toHaveAttribute("href", "/");
    });

    it("renders every line item with its name, unit price, and subtotal", () => {
        mockUseCart.mockReturnValue({
            ...baseCart,
            items: [
                { cart_item_id: 1, product_id: 10, name: "Crochet Bag", unit_price: 5000, quantity: 2, subtotal: 10000, stock: 5 },
                { cart_item_id: 2, product_id: 11, name: "Crochet Hat", unit_price: 3000, quantity: 1, subtotal: 3000, stock: 2 }
            ],
            total: 13000
        });

        renderCart();

        expect(screen.getByText("Crochet Bag")).toBeInTheDocument();
        expect(screen.getByText("Crochet Hat")).toBeInTheDocument();
        expect(screen.getByText("TZS 13000")).toBeInTheDocument();
    });

    it("calls updateQuantity with the new value when a quantity input changes", () => {
        mockUseCart.mockReturnValue({
            ...baseCart,
            items: [{ cart_item_id: 1, product_id: 10, name: "Crochet Bag", unit_price: 5000, quantity: 2, subtotal: 10000, stock: 5 }],
            total: 10000
        });
        renderCart();

        const input = screen.getByDisplayValue("2");
        fireEvent.change(input, { target: { value: "4" } });

        expect(baseCart.updateQuantity).toHaveBeenCalledWith(10, 4);
    });

    it("never lets the quantity drop below 1", () => {
        mockUseCart.mockReturnValue({
            ...baseCart,
            items: [{ cart_item_id: 1, product_id: 10, name: "Crochet Bag", unit_price: 5000, quantity: 2, subtotal: 10000, stock: 5 }],
            total: 10000
        });
        renderCart();

        const input = screen.getByDisplayValue("2");
        fireEvent.change(input, { target: { value: "0" } });

        expect(baseCart.updateQuantity).toHaveBeenCalledWith(10, 1);
    });

    it("calls removeFromCart with the product id when Remove is clicked", async () => {
        mockUseCart.mockReturnValue({
            ...baseCart,
            items: [{ cart_item_id: 1, product_id: 10, name: "Crochet Bag", unit_price: 5000, quantity: 2, subtotal: 10000, stock: 5 }],
            total: 10000
        });
        const user = userEvent.setup();
        renderCart();

        await user.click(screen.getByText("Remove"));

        expect(baseCart.removeFromCart).toHaveBeenCalledWith(10);
    });

    it("navigates to /checkout when the checkout button is clicked", async () => {
        mockUseCart.mockReturnValue({
            ...baseCart,
            items: [{ cart_item_id: 1, product_id: 10, name: "Crochet Bag", unit_price: 5000, quantity: 2, subtotal: 10000, stock: 5 }],
            total: 10000
        });
        const user = userEvent.setup();
        renderCart();

        await user.click(screen.getByText("Checkout"));

        expect(mockNavigate).toHaveBeenCalledWith("/checkout");
    });
});
