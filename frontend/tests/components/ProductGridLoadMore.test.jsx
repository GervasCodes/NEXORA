import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockGet = vi.fn();
vi.mock("../../src/api/client", () => ({
    default: { get: (...args) => mockGet(...args) }
}));

vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({
        t: (key) => ({
            "infinite.loadMore": "Load more",
            "infinite.error": "Couldn't load more.",
            "common.tryAgain": "Try again",
            "common.loading": "Loading"
        }[key] || key)
    })
}));
vi.mock("../../src/context/CurrencyContext", () => ({ useCurrency: () => ({ format: (v) => `TZS ${v}` }) }));
vi.mock("../../src/context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../../src/context/WishlistContext", () => ({ useWishlist: () => ({ isSaved: () => false, toggle: () => {} }) }));

import ProductGrid from "../../src/components/ProductGrid";

const product = (id) => ({
    id, name: `Product ${id}`, slug: `product-${id}`, price: "10000", discount_price: null, stock: 5,
    store_name: "Store", is_verified: 0, image_url: null, average_rating: null, review_count: 0
});
const pageOf = (rows, totalPages = 2) => ({ data: { data: rows, pagination: { totalPages, total: 48 } } });

const renderGrid = () => render(<MemoryRouter><ProductGrid params={{}} /></MemoryRouter>);

describe("ProductGrid - Load more", () => {
    beforeEach(() => {
        window.localStorage.clear();
        mockGet.mockReset();
    });

    it("keeps the products on screen when Load more fails, shows Retry, and retries page 2 (not page 3)", async () => {
        const user = userEvent.setup();
        mockGet
            .mockResolvedValueOnce(pageOf([product(1)]))
            .mockRejectedValueOnce(new Error("network"))
            .mockResolvedValueOnce(pageOf([product(2)]));
        renderGrid();
        await screen.findByText("Product 1");

        await user.click(screen.getByRole("button", { name: "Load more" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load more.");
        expect(screen.getByText("Product 1")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Try again" }));
        await screen.findByText("Product 2");
        expect(mockGet.mock.calls[2][1].params.page).toBe(2);
    });

    it("does not render the same product twice when pages overlap", async () => {
        const user = userEvent.setup();
        mockGet
            .mockResolvedValueOnce(pageOf([product(1), product(2)]))
            .mockResolvedValueOnce(pageOf([product(2), product(3)]));
        renderGrid();
        await screen.findByText("Product 1");

        await user.click(screen.getByRole("button", { name: "Load more" }));
        await screen.findByText("Product 3");
        expect(screen.getAllByText("Product 2")).toHaveLength(1);
    });
});

describe("ProductGrid - auto load does not loop on failure", () => {
    let original;
    beforeEach(() => {
        window.localStorage.clear();
        mockGet.mockReset();
        original = global.IntersectionObserver;
        // A sentinel that is permanently in view, like a shopper who has
        // scrolled to the bottom: every newly created observer reports it.
        global.IntersectionObserver = class {
            constructor(cb) { this.cb = cb; }
            observe() { setTimeout(() => this.cb([{ isIntersecting: true }]), 0); }
            unobserve() {}
            disconnect() {}
        };
    });
    afterEach(() => { global.IntersectionObserver = original; });

    it("stops after one failed request and waits for Retry", async () => {
        mockGet
            .mockResolvedValueOnce(pageOf([product(1)], 5))
            .mockRejectedValue(new Error("offline"));
        renderGrid();
        await screen.findByText("Product 1");

        await screen.findByRole("alert");
        await act(async () => { await new Promise((r) => setTimeout(r, 120)); });

        // 1 initial page + exactly 1 failed Load more. The old code re-armed
        // its observer after every failure and kept hammering the API.
        expect(mockGet).toHaveBeenCalledTimes(2);
        expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });
});
