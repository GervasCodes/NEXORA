import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn() }
}));

vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({
        t: (key) => ({
            "filters.rating": "Rating",
            "filters.sortBy": "Sort by",
            "products.viewGrid": "Grid view",
            "products.viewList": "List view"
        }[key] || key)
    })
}));

vi.mock("../../src/context/CurrencyContext", () => ({
    useCurrency: () => ({ currency: "TZS", toTzs: (v) => (v === "" ? null : Number(v)), format: (v) => `TZS ${v}` })
}));

vi.mock("../../src/context/AuthContext", () => ({
    useAuth: () => ({ user: null })
}));

vi.mock("../../src/context/WishlistContext", () => ({
    useWishlist: () => ({ isSaved: () => false, toggle: () => {} })
}));

vi.mock("../../src/context/CartContext", () => ({
    useCart: () => ({ addToCart: () => {} })
}));

vi.mock("../../src/context/ToastContext", () => ({
    useToast: () => ({ success: () => {}, error: () => {} })
}));

import api from "../../src/api/client";
import StorePage from "../../src/pages/StorePage";

const renderPage = (slug = "mama-ntilies-kitchen") =>
    render(
        <MemoryRouter initialEntries={[`/stores/${slug}`]}>
            <Routes>
                <Route path="/stores/:slug" element={<StorePage />} />
            </Routes>
        </MemoryRouter>
    );

const store = {
    user_id: 42,
    store_name: "Mama Ntilie's Kitchen",
    store_slug: "mama-ntilies-kitchen",
    store_description: "Home-cooked meals delivered fresh.",
    store_logo: "https://cdn/logo.png",
    store_banner: "https://cdn/banner.png",
    country: "Tanzania",
    region: "Dar es Salaam",
    city: "Kinondoni",
    store_type_name: "Grocery",
    is_verified: 1,
    created_at: "2024-03-10T00:00:00.000Z",
    average_rating: "4.6",
    review_count: 18
};

// Default: store loads fine, catalog and reviews both come back empty.
// Individual tests override with mockImplementation when they need to
// assert on the /products call itself (Phase 5C), on catalog contents,
// or on /reviews/store/:sellerId (Phase 5D).
const emptyReviews = { reviews: [], average_rating: null, review_count: 0, page: 1, totalPages: 1 };

const mockEmptyCatalog = () => {
    api.get.mockImplementation((url) => {
        if (url === "/stores/mama-ntilies-kitchen") return Promise.resolve({ data: { data: store } });
        if (url === "/products") return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 1 } } });
        if (url === "/reviews/store/42") return Promise.resolve({ data: { data: emptyReviews } });
        return Promise.reject(new Error(`unexpected url ${url}`));
    });
};

beforeEach(() => {
    api.get.mockReset();
});

describe("StorePage (Phase 5A)", () => {
    it("shows a loading state before the request resolves", () => {
        api.get.mockReturnValue(new Promise(() => {})); // never resolves
        renderPage();

        expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("fetches by slug and renders the store's basics", async () => {
        mockEmptyCatalog();
        renderPage();

        await waitFor(() => expect(screen.getByText("Mama Ntilie's Kitchen")).toBeInTheDocument());

        expect(api.get).toHaveBeenCalledWith("/stores/mama-ntilies-kitchen");
        expect(screen.getByText("Home-cooked meals delivered fresh.")).toBeInTheDocument();
        expect(screen.getByText("Grocery · Kinondoni, Dar es Salaam, Tanzania")).toBeInTheDocument();
    });

    it("omits the description paragraph when none is set", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/stores/mama-ntilies-kitchen") return Promise.resolve({ data: { data: { ...store, store_description: null } } });
            if (url === "/products") return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 1 } } });
            if (url === "/reviews/store/42") return Promise.resolve({ data: { data: emptyReviews } });
            return Promise.reject(new Error(`unexpected url ${url}`));
        });
        renderPage();

        await waitFor(() => expect(screen.getByText("Mama Ntilie's Kitchen")).toBeInTheDocument());
        expect(screen.queryByText("Home-cooked meals delivered fresh.")).not.toBeInTheDocument();
    });

    it("shows a not-found state when the slug doesn't match any store", async () => {
        api.get.mockRejectedValue(new Error("404"));
        renderPage("no-such-store");

        await waitFor(() => expect(screen.getByText("Store not found")).toBeInTheDocument());
        expect(screen.getByText("Back to marketplace")).toBeInTheDocument();
    });
});

describe("StorePage trust info (Phase 5B)", () => {
    it("shows the verified badge, rating, and member-since line for a verified, reviewed store", async () => {
        mockEmptyCatalog();
        renderPage();

        await waitFor(() => expect(screen.getByText("Mama Ntilie's Kitchen")).toBeInTheDocument());

        expect(screen.getByText("Verified")).toBeInTheDocument();
        expect(screen.getByText("4.6")).toBeInTheDocument();
        expect(screen.getByText("(18)")).toBeInTheDocument();
        expect(screen.getByText("Member since Mar 2024")).toBeInTheDocument();
    });

    it("hides the verified badge for a store without the paid badge", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/stores/mama-ntilies-kitchen") return Promise.resolve({ data: { data: { ...store, is_verified: 0 } } });
            if (url === "/products") return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 1 } } });
            if (url === "/reviews/store/42") return Promise.resolve({ data: { data: emptyReviews } });
            return Promise.reject(new Error(`unexpected url ${url}`));
        });
        renderPage();

        await waitFor(() => expect(screen.getByText("Mama Ntilie's Kitchen")).toBeInTheDocument());
        expect(screen.queryByText("Verified")).not.toBeInTheDocument();
    });

    it("hides the rating line (but still shows member since) for a store with no reviews yet", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/stores/mama-ntilies-kitchen") return Promise.resolve({ data: { data: { ...store, average_rating: null, review_count: 0 } } });
            if (url === "/products") return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 1 } } });
            if (url === "/reviews/store/42") return Promise.resolve({ data: { data: emptyReviews } });
            return Promise.reject(new Error(`unexpected url ${url}`));
        });
        renderPage();

        await waitFor(() => expect(screen.getByText("Mama Ntilie's Kitchen")).toBeInTheDocument());
        expect(screen.queryByText("(18)")).not.toBeInTheDocument();
        expect(screen.getByText("Member since Mar 2024")).toBeInTheDocument();
    });
});

describe("StorePage catalog (Phase 5C)", () => {
    it("loads this store's products by seller_id, not the whole catalog", async () => {
        mockEmptyCatalog();
        renderPage();

        await waitFor(() =>
            expect(api.get).toHaveBeenCalledWith("/products", { params: { seller_id: 42, limit: 24, page: 1 } })
        );
    });

    it("shows an empty state when the store has no products yet", async () => {
        mockEmptyCatalog();
        renderPage();

        await waitFor(() => expect(screen.getByText("No products yet")).toBeInTheDocument());
        expect(screen.getByText("This store hasn't listed anything yet - check back soon.")).toBeInTheDocument();
    });

    it("hides the store and location dropdowns since every product here already shares one seller/region", async () => {
        mockEmptyCatalog();
        renderPage();

        await waitFor(() => expect(screen.getByText("Mama Ntilie's Kitchen")).toBeInTheDocument());
        expect(screen.queryByLabelText("Store")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
        expect(api.get).not.toHaveBeenCalledWith("/products/filters/sellers", expect.anything());
        expect(api.get).not.toHaveBeenCalledWith("/products/filters/regions", expect.anything());
    });

    it("shows the product count once the catalog loads", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/stores/mama-ntilies-kitchen") return Promise.resolve({ data: { data: store } });
            if (url === "/reviews/store/42") return Promise.resolve({ data: { data: emptyReviews } });
            if (url === "/products") {
                return Promise.resolve({
                    data: {
                        data: [{
                            id: 1,
                            name: "Chicken pilau",
                            slug: "chicken-pilau",
                            price: "12000",
                            discount_price: null,
                            stock: 5,
                            store_name: store.store_name,
                            is_verified: 1,
                            image_url: null,
                            average_rating: null,
                            review_count: 0
                        }],
                        pagination: { total: 1, totalPages: 1 }
                    }
                });
            }
            return Promise.reject(new Error(`unexpected url ${url}`));
        });
        renderPage();

        await waitFor(() => expect(screen.getByText("1 product")).toBeInTheDocument());
        expect(screen.getByText("Chicken pilau")).toBeInTheDocument();
    });
});

describe("StorePage about & delivery (Phase 5D)", () => {
    it("shows an About heading above the store description", async () => {
        mockEmptyCatalog();
        renderPage();

        await waitFor(() => expect(screen.getByText("About")).toBeInTheDocument());
        expect(screen.getByText("Home-cooked meals delivered fresh.")).toBeInTheDocument();
    });

    it("omits the About heading when there's no description", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/stores/mama-ntilies-kitchen") return Promise.resolve({ data: { data: { ...store, store_description: null } } });
            if (url === "/products") return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 1 } } });
            if (url === "/reviews/store/42") return Promise.resolve({ data: { data: emptyReviews } });
            return Promise.reject(new Error(`unexpected url ${url}`));
        });
        renderPage();

        await waitFor(() => expect(screen.getByText("Mama Ntilie's Kitchen")).toBeInTheDocument());
        expect(screen.queryByText("About")).not.toBeInTheDocument();
    });

    it("shows the distance-pricing delivery note when the store has a pickup pin set", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/stores/mama-ntilies-kitchen") return Promise.resolve({ data: { data: { ...store, has_pickup_pin: true } } });
            if (url === "/products") return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 1 } } });
            if (url === "/reviews/store/42") return Promise.resolve({ data: { data: emptyReviews } });
            return Promise.reject(new Error(`unexpected url ${url}`));
        });
        renderPage();

        await waitFor(() =>
            expect(
                screen.getByText("This store has a pickup location set, so delivery fees are calculated by distance at checkout.")
            ).toBeInTheDocument()
        );
    });

    it("shows the flat-fee delivery note when the store has no pickup pin", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/stores/mama-ntilies-kitchen") return Promise.resolve({ data: { data: { ...store, has_pickup_pin: false } } });
            if (url === "/products") return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 1 } } });
            if (url === "/reviews/store/42") return Promise.resolve({ data: { data: emptyReviews } });
            return Promise.reject(new Error(`unexpected url ${url}`));
        });
        renderPage();

        await waitFor(() =>
            expect(screen.getByText("Delivery fees are calculated at checkout.")).toBeInTheDocument()
        );
    });
});

describe("StorePage reviews (Phase 5D)", () => {
    it("fetches reviews by the store's seller id, not the whole product catalog", async () => {
        mockEmptyCatalog();
        renderPage();

        await waitFor(() =>
            expect(api.get).toHaveBeenCalledWith("/reviews/store/42", { params: { page: 1 } })
        );
    });

    it("shows an empty state when the store has no reviews yet", async () => {
        mockEmptyCatalog();
        renderPage();

        await waitFor(() => expect(screen.getByText("No reviews yet.")).toBeInTheDocument());
    });

    it("renders reviews with rating, comment, buyer name and a link to the reviewed product", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/stores/mama-ntilies-kitchen") return Promise.resolve({ data: { data: store } });
            if (url === "/products") return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 1 } } });
            if (url === "/reviews/store/42") {
                return Promise.resolve({
                    data: {
                        data: {
                            reviews: [{
                                id: 501,
                                rating: 5,
                                comment: "Delicious and arrived hot!",
                                created_at: "2026-06-01T00:00:00.000Z",
                                first_name: "Asha",
                                last_name: "M",
                                product_id: 1,
                                product_name: "Chicken pilau",
                                product_slug: "chicken-pilau"
                            }],
                            average_rating: 4.6,
                            review_count: 18,
                            page: 1,
                            totalPages: 2
                        }
                    }
                });
            }
            return Promise.reject(new Error(`unexpected url ${url}`));
        });
        renderPage();

        await waitFor(() => expect(screen.getByText("Asha M")).toBeInTheDocument());
        expect(screen.getByText("★ 5/5")).toBeInTheDocument();
        expect(screen.getByText("Delicious and arrived hot!")).toBeInTheDocument();
        expect(screen.getByText("on Chicken pilau").closest("a")).toHaveAttribute("href", "/products/chicken-pilau");
        expect(screen.getByText("Load more reviews")).toBeInTheDocument();
    });

    it("hides the Load more button once every review page has loaded", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/stores/mama-ntilies-kitchen") return Promise.resolve({ data: { data: store } });
            if (url === "/products") return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 1 } } });
            if (url === "/reviews/store/42") {
                return Promise.resolve({
                    data: {
                        data: {
                            reviews: [{
                                id: 501, rating: 5, comment: null, created_at: "2026-06-01T00:00:00.000Z",
                                first_name: "Asha", last_name: "M", product_id: 1,
                                product_name: "Chicken pilau", product_slug: "chicken-pilau"
                            }],
                            average_rating: 5,
                            review_count: 1,
                            page: 1,
                            totalPages: 1
                        }
                    }
                });
            }
            return Promise.reject(new Error(`unexpected url ${url}`));
        });
        renderPage();

        await waitFor(() => expect(screen.getByText("Asha M")).toBeInTheDocument());
        expect(screen.queryByText("Load more reviews")).not.toBeInTheDocument();
    });
});

describe("StorePage branding (Phase 7B)", () => {
    it("shows the tagline and social links when set", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/stores/mama-ntilies-kitchen") {
                return Promise.resolve({
                    data: {
                        data: {
                            ...store,
                            store_tagline: "Fresh flavors, delivered fast",
                            social_instagram: "@mamantilie",
                            social_facebook: "mamantilie",
                            social_whatsapp: "255700000000"
                        }
                    }
                });
            }
            if (url === "/products") return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 1 } } });
            if (url === "/reviews/store/42") return Promise.resolve({ data: { data: emptyReviews } });
            return Promise.reject(new Error(`unexpected url ${url}`));
        });
        renderPage();

        await waitFor(() => expect(screen.getByText("Fresh flavors, delivered fast")).toBeInTheDocument());
        expect(screen.getByTitle("Instagram")).toHaveAttribute("href", "https://instagram.com/mamantilie");
        expect(screen.getByTitle("Facebook")).toHaveAttribute("href", "https://facebook.com/mamantilie");
        expect(screen.getByTitle("WhatsApp")).toHaveAttribute("href", "https://wa.me/255700000000");
    });

    it("omits the tagline and social row when none are set", async () => {
        mockEmptyCatalog();
        renderPage();

        await waitFor(() => expect(screen.getByText("Mama Ntilie's Kitchen")).toBeInTheDocument());
        expect(screen.queryByTitle("Instagram")).not.toBeInTheDocument();
        expect(screen.queryByTitle("Facebook")).not.toBeInTheDocument();
        expect(screen.queryByTitle("WhatsApp")).not.toBeInTheDocument();
    });
});

describe("StorePage trust & safety (Phase 7D)", () => {
    it("shows both rows when the seller is both paid-verified and identity-verified", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/stores/mama-ntilies-kitchen") {
                return Promise.resolve({ data: { data: { ...store, is_verified: 1, identity_verified: 1 } } });
            }
            if (url === "/stores/mama-ntilies-kitchen/collections") return Promise.resolve({ data: { data: [] } });
            if (url === "/products") return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 1 } } });
            if (url === "/reviews/store/42") return Promise.resolve({ data: { data: emptyReviews } });
            return Promise.reject(new Error(`unexpected url ${url}`));
        });
        renderPage();

        await waitFor(() => expect(screen.getByText("Trust & safety")).toBeInTheDocument());
        expect(screen.getByText("Verified Seller")).toBeInTheDocument();
        expect(screen.getByText("Identity Verified")).toBeInTheDocument();
    });

    it("shows only the Identity Verified row when the paid badge isn't active", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/stores/mama-ntilies-kitchen") {
                return Promise.resolve({ data: { data: { ...store, is_verified: 0, identity_verified: 1 } } });
            }
            if (url === "/stores/mama-ntilies-kitchen/collections") return Promise.resolve({ data: { data: [] } });
            if (url === "/products") return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 1 } } });
            if (url === "/reviews/store/42") return Promise.resolve({ data: { data: emptyReviews } });
            return Promise.reject(new Error(`unexpected url ${url}`));
        });
        renderPage();

        await waitFor(() => expect(screen.getByText("Identity Verified")).toBeInTheDocument());
        expect(screen.queryByText("Verified Seller")).not.toBeInTheDocument();
    });

    it("hides the whole Trust & safety section when neither signal is true", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/stores/mama-ntilies-kitchen") {
                return Promise.resolve({ data: { data: { ...store, is_verified: 0, identity_verified: 0 } } });
            }
            if (url === "/stores/mama-ntilies-kitchen/collections") return Promise.resolve({ data: { data: [] } });
            if (url === "/products") return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 1 } } });
            if (url === "/reviews/store/42") return Promise.resolve({ data: { data: emptyReviews } });
            return Promise.reject(new Error(`unexpected url ${url}`));
        });
        renderPage();

        await waitFor(() => expect(screen.getByText("Mama Ntilie's Kitchen")).toBeInTheDocument());
        expect(screen.queryByText("Trust & safety")).not.toBeInTheDocument();
    });
});

describe("StorePage collections (Phase 7C)", () => {
    const collectionProduct = {
        id: 9, name: "Handwoven Basket", slug: "handwoven-basket",
        price: "15000.00", discount_price: null, stock: 4,
        store_name: "Mama Ntilie's Kitchen", is_verified: 1, region: "Dar es Salaam",
        image_url: "https://cdn/basket.png", average_rating: "4.5", review_count: 3
    };

    it("renders a row per collection with at least one product", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/stores/mama-ntilies-kitchen") return Promise.resolve({ data: { data: store } });
            if (url === "/stores/mama-ntilies-kitchen/collections") {
                return Promise.resolve({
                    data: { data: [{ id: 1, name: "New Arrivals", products: [collectionProduct] }] }
                });
            }
            if (url === "/products") return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 1 } } });
            if (url === "/reviews/store/42") return Promise.resolve({ data: { data: emptyReviews } });
            return Promise.reject(new Error(`unexpected url ${url}`));
        });
        renderPage();

        await waitFor(() => expect(screen.getByText("New Arrivals")).toBeInTheDocument());
        expect(screen.getByText("Handwoven Basket")).toBeInTheDocument();
    });

    it("renders no collection rows for a store with none", async () => {
        mockEmptyCatalog();
        renderPage();

        await waitFor(() => expect(screen.getByText("Mama Ntilie's Kitchen")).toBeInTheDocument());
        expect(screen.queryByText("New Arrivals")).not.toBeInTheDocument();
    });
});
