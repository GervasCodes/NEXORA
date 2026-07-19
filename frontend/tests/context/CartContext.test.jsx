import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
    extractErrorMessage: (error) => error?.response?.data?.message || "Something went wrong. Please try again"
}));

const mockUseAuth = vi.fn();
vi.mock("../../src/context/AuthContext", () => ({
    useAuth: () => mockUseAuth()
}));

import api from "../../src/api/client";
import { CartProvider, useCart } from "../../src/context/CartContext";

function Harness() {
    const { items, total, itemCount, addToCart, updateQuantity, removeFromCart } = useCart();
    return (
        <div>
            <div data-testid="count">{itemCount}</div>
            <div data-testid="total">{total}</div>
            <div data-testid="items">{JSON.stringify(items)}</div>
            <button onClick={() => addToCart(5, 2)}>Add</button>
            <button onClick={() => updateQuantity(5, 9)}>Update</button>
            <button onClick={() => removeFromCart(5)}>Remove</button>
        </div>
    );
}

const renderWithProvider = () =>
    render(
        <CartProvider>
            <Harness />
        </CartProvider>
    );

beforeEach(() => {
    vi.clearAllMocks();
});

describe("CartContext", () => {
    it("fetches the cart on mount for a logged-in buyer", async () => {
        mockUseAuth.mockReturnValue({ user: { id: 1, role: "buyer" } });
        api.get.mockResolvedValue({ data: { data: { items: [{ product_id: 5, quantity: 2 }], total: 2000 } } });

        renderWithProvider();

        await waitFor(() => expect(screen.getByTestId("total")).toHaveTextContent("2000"));
        expect(api.get).toHaveBeenCalledWith("/cart");
        expect(screen.getByTestId("count")).toHaveTextContent("2");
    });

    it("never calls the cart endpoint for a logged-out user, and stays empty", async () => {
        mockUseAuth.mockReturnValue({ user: null });

        renderWithProvider();

        await waitFor(() => expect(screen.getByTestId("total")).toHaveTextContent("0"));
        expect(api.get).not.toHaveBeenCalled();
    });

    it("never calls the cart endpoint for a non-buyer role (seller)", async () => {
        mockUseAuth.mockReturnValue({ user: { id: 1, role: "seller" } });

        renderWithProvider();

        await waitFor(() => expect(screen.getByTestId("total")).toHaveTextContent("0"));
        expect(api.get).not.toHaveBeenCalled();
    });

    it("adds an item then refreshes the cart from the server", async () => {
        mockUseAuth.mockReturnValue({ user: { id: 1, role: "buyer" } });
        api.get
            .mockResolvedValueOnce({ data: { data: { items: [], total: 0 } } }) // initial mount
            .mockResolvedValueOnce({ data: { data: { items: [{ product_id: 5, quantity: 2 }], total: 2000 } } }); // post-add refresh
        api.post.mockResolvedValue({});

        const user = userEvent.setup();
        renderWithProvider();
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

        await user.click(screen.getByText("Add"));

        expect(api.post).toHaveBeenCalledWith("/cart", { product_id: 5, quantity: 2 });
        await waitFor(() => expect(screen.getByTestId("total")).toHaveTextContent("2000"));
    });

    it("returns a failure result with a message when adding to cart fails, without throwing", async () => {
        mockUseAuth.mockReturnValue({ user: { id: 1, role: "buyer" } });
        api.get.mockResolvedValue({ data: { data: { items: [], total: 0 } } });
        api.post.mockRejectedValue({ response: { data: { message: "Out of stock" } } });

        let hookResult;
        function Capture() {
            hookResult = useCart();
            return null;
        }
        render(
            <CartProvider>
                <Capture />
            </CartProvider>
        );
        await waitFor(() => expect(api.get).toHaveBeenCalled());

        const result = await hookResult.addToCart(5, 1);
        expect(result).toEqual({ success: false, message: "Out of stock" });
    });

    it("updates quantity via PUT and removes an item via DELETE, each followed by a refresh", async () => {
        mockUseAuth.mockReturnValue({ user: { id: 1, role: "buyer" } });
        api.get.mockResolvedValue({ data: { data: { items: [], total: 0 } } });
        api.put.mockResolvedValue({});
        api.delete.mockResolvedValue({});

        const user = userEvent.setup();
        renderWithProvider();
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

        await user.click(screen.getByText("Update"));
        expect(api.put).toHaveBeenCalledWith("/cart/5", { quantity: 9 });
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));

        await user.click(screen.getByText("Remove"));
        expect(api.delete).toHaveBeenCalledWith("/cart/5");
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
    });

    it("sums itemCount across multiple distinct line items, not just item rows", async () => {
        mockUseAuth.mockReturnValue({ user: { id: 1, role: "buyer" } });
        api.get.mockResolvedValue({
            data: { data: { items: [{ product_id: 1, quantity: 3 }, { product_id: 2, quantity: 4 }], total: 999 } }
        });

        renderWithProvider();

        await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("7"));
    });
});
