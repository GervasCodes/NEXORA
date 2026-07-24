import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../src/context/CurrencyContext", () => ({
    useCurrency: () => ({ format: (v) => `TZS ${v}` })
}));

// Overridable per-test via vi.mocked(useAuth).mockReturnValue(...) - default
// stays a logged-out guest so the pre-4C tests (which never touch cart/auth)
// keep behaving exactly as before.
vi.mock("../../src/context/AuthContext", () => ({
    useAuth: vi.fn(() => ({ user: null }))
}));

vi.mock("../../src/context/WishlistContext", () => ({
    useWishlist: () => ({ isSaved: () => false, toggle: () => {} })
}));

const addToCart = vi.fn();
vi.mock("../../src/context/CartContext", () => ({
    useCart: () => ({ addToCart })
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("../../src/context/ToastContext", () => ({
    useToast: () => ({ success: toastSuccess, error: toastError })
}));

import { useAuth } from "../../src/context/AuthContext";
import ProductCard from "../../src/components/ProductCard";

const product = {
    id: 1,
    name: "Sample product",
    slug: "sample-product",
    price: "10000",
    discount_price: null,
    stock: 12,
    store_name: "Sample Store",
    is_verified: 1,
    image_url: null,
    average_rating: 4.5,
    review_count: 8
};

function renderCard(layout) {
    return render(
        <MemoryRouter>
            <ProductCard product={product} layout={layout} />
        </MemoryRouter>
    );
}

function renderCardWithProduct(overrides, layout) {
    return render(
        <MemoryRouter>
            <ProductCard product={{ ...product, ...overrides }} layout={layout} />
        </MemoryRouter>
    );
}

describe("ProductCard layout prop (Phase 4A)", () => {
    it("renders the vertical tile layout by default", () => {
        const { container } = renderCard(undefined);

        expect(screen.getByText("Sample product")).toBeInTheDocument();
        expect(container.querySelector("a").className).toContain("block");
    });

    it("renders a horizontal row when layout=\"list\"", () => {
        const { container } = renderCard("list");

        expect(screen.getByText("Sample product")).toBeInTheDocument();
        expect(container.querySelector("a").className).toContain("flex");
    });

    it("shows the same data (badge, rating, price) in both layouts", () => {
        renderCard("list");

        expect(screen.getByText("Verified")).toBeInTheDocument();
        expect(screen.getByText("4.5")).toBeInTheDocument();
        expect(screen.getByText("TZS 10000")).toBeInTheDocument();
    });
});

describe("ProductCard location (Phase 4B)", () => {
    it("shows the seller's region next to the store name when present", () => {
        renderCardWithProduct({ region: "Dodoma" });

        expect(screen.getByText("Dodoma")).toBeInTheDocument();
    });

    it("renders nothing extra when the seller has no region set", () => {
        const { container } = renderCardWithProduct({ region: null });

        // No stray location text, and no leftover icon markup for it.
        expect(container.querySelectorAll("svg").length).toBe(1); // just the verified badge icon
    });

    it("shows the region in list layout too", () => {
        renderCardWithProduct({ region: "Mwanza" }, "list");

        expect(screen.getByText("Mwanza")).toBeInTheDocument();
    });
});

describe("ProductCard add to cart (Phase 4C)", () => {
    it("hides the button for guests (no user)", () => {
        useAuth.mockReturnValue({ user: null });
        renderCard(undefined);

        expect(screen.queryByText("Add to cart")).not.toBeInTheDocument();
    });

    it("hides the button for sellers", () => {
        useAuth.mockReturnValue({ user: { role: "seller" } });
        renderCard(undefined);

        expect(screen.queryByText("Add to cart")).not.toBeInTheDocument();
    });

    it("shows the button for buyers and calls CartContext.addToCart on click", async () => {
        useAuth.mockReturnValue({ user: { role: "buyer" } });
        addToCart.mockResolvedValueOnce({ success: true });
        renderCard(undefined);

        fireEvent.click(screen.getByText("Add to cart"));

        await waitFor(() => expect(addToCart).toHaveBeenCalledWith(1, 1));
        expect(toastSuccess).toHaveBeenCalled();
    });

    it("shows an error toast when the add fails", async () => {
        useAuth.mockReturnValue({ user: { role: "buyer" } });
        addToCart.mockResolvedValueOnce({ success: false, message: "Out of stock" });
        renderCard(undefined);

        fireEvent.click(screen.getByText("Add to cart"));

        await waitFor(() => expect(toastError).toHaveBeenCalledWith("Out of stock"));
    });

    it("prevents the card's own Link navigation when clicked (fireEvent.click returns false)", () => {
        useAuth.mockReturnValue({ user: { role: "buyer" } });
        addToCart.mockResolvedValueOnce({ success: true });
        renderCard(undefined);

        // handleAddToCart calls e.preventDefault() before anything else, so
        // the click never falls through to the surrounding <Link>'s
        // navigation - fireEvent.click returns false when preventDefault
        // was called on a cancelable event.
        const notCanceled = fireEvent.click(screen.getByText("Add to cart"));

        expect(notCanceled).toBe(false);
    });

    it("disables the button in grid layout when out of stock, and omits it entirely in list layout", () => {
        useAuth.mockReturnValue({ user: { role: "buyer" } });

        const grid = renderCardWithProduct({ stock: 0 }, undefined);
        expect(grid.getByText("Add to cart")).toBeDisabled();
        grid.unmount();

        const list = renderCardWithProduct({ stock: 0 }, "list");
        expect(list.queryByText("Add to cart")).not.toBeInTheDocument();
    });
});
