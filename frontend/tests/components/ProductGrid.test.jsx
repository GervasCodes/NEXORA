import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockGet = vi.fn();
vi.mock("../../src/api/client", () => ({
    default: { get: (...args) => mockGet(...args) }
}));

vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({
        t: (key) => ({
            "products.viewGrid": "Grid view",
            "products.viewList": "List view"
        }[key] || key)
    })
}));

vi.mock("../../src/context/CurrencyContext", () => ({
    useCurrency: () => ({ format: (v) => `TZS ${v}` })
}));

vi.mock("../../src/context/AuthContext", () => ({
    useAuth: () => ({ user: null })
}));

vi.mock("../../src/context/WishlistContext", () => ({
    useWishlist: () => ({ isSaved: () => false, toggle: () => {} })
}));

import ProductGrid from "../../src/components/ProductGrid";

const SAMPLE_PRODUCT = {
    id: 1,
    name: "Sample product",
    slug: "sample-product",
    price: "10000",
    discount_price: null,
    stock: 12,
    store_name: "Sample Store",
    is_verified: 0,
    image_url: null,
    average_rating: null,
    review_count: 0
};

function renderGrid() {
    return render(
        <MemoryRouter>
            <ProductGrid params={{}} />
        </MemoryRouter>
    );
}

describe("ProductGrid view toggle (Phase 4A)", () => {
    beforeEach(() => {
        window.localStorage.clear();
        mockGet.mockReset();
        mockGet.mockResolvedValue({
            data: {
                data: [SAMPLE_PRODUCT],
                pagination: { totalPages: 1, total: 1 }
            }
        });
    });

    it("defaults to grid layout when nothing is stored", async () => {
        renderGrid();

        await waitFor(() => expect(screen.getByText("Sample product")).toBeInTheDocument());

        expect(screen.getByLabelText("Grid view")).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByLabelText("List view")).toHaveAttribute("aria-pressed", "false");
    });

    it("switches to list layout on click and persists the choice", async () => {
        const user = userEvent.setup();
        renderGrid();

        await waitFor(() => expect(screen.getByText("Sample product")).toBeInTheDocument());

        await user.click(screen.getByLabelText("List view"));

        expect(screen.getByLabelText("List view")).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByLabelText("Grid view")).toHaveAttribute("aria-pressed", "false");
        expect(window.localStorage.getItem("nexora_product_view")).toBe("list");
    });

    it("restores a previously chosen list layout on mount", async () => {
        window.localStorage.setItem("nexora_product_view", "list");
        renderGrid();

        await waitFor(() => expect(screen.getByText("Sample product")).toBeInTheDocument());

        expect(screen.getByLabelText("List view")).toHaveAttribute("aria-pressed", "true");
    });
});
