import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { axe } from "jest-axe";

// Automated axe-core pass over the entry points a first-time visitor hits
// in their first 30 seconds: the home carousel, product tiles (grid and
// list), and the sign-in / register forms. Checkout, Bookings,
// BookingDetail and NewDispute already carry their own axe checks in
// their page test files. axe complements a manual screen-reader pass,
// it doesn't replace one.

vi.mock("../../src/api/client", () => ({
    default: {
        get: vi.fn(() => Promise.reject(new Error("offline"))),
        post: vi.fn(() => Promise.resolve({ data: {} }))
    }
}));

vi.mock("../../src/context/AuthContext", () => ({
    useAuth: vi.fn(() => ({
        user: null,
        login: vi.fn(),
        register: vi.fn(),
        verifyLoginOtp: vi.fn(),
        resendLoginOtp: vi.fn()
    }))
}));

vi.mock("../../src/context/CurrencyContext", async () => {
    const actual = await vi.importActual("../../src/context/CurrencyContext");
    return { ...actual, useCurrency: () => ({ format: (v) => `TZS ${v}` }) };
});

vi.mock("../../src/context/WishlistContext", () => ({
    useWishlist: () => ({ isSaved: () => false, toggle: () => {} })
}));

vi.mock("../../src/context/CartContext", () => ({
    useCart: () => ({ addToCart: vi.fn() })
}));

vi.mock("../../src/context/ToastContext", () => ({
    useToast: () => ({ success: vi.fn(), error: vi.fn() })
}));

import HomeCarousel from "../../src/components/HomeCarousel";
import ProductCard from "../../src/components/ProductCard";
import Login from "../../src/pages/Login";
import Register from "../../src/pages/Register";
import { LanguageProvider } from "../../src/context/LanguageContext";
import { CurrencyProvider } from "../../src/context/CurrencyContext";
import { DataSaverProvider } from "../../src/context/DataSaverContext";

const withProviders = (ui) => (
    <MemoryRouter>
        <LanguageProvider><CurrencyProvider><DataSaverProvider>{ui}</DataSaverProvider></CurrencyProvider></LanguageProvider>
    </MemoryRouter>
);

const product = {
    id: 1,
    name: "Sample product",
    slug: "sample-product",
    price: "10000",
    discount_price: null,
    stock: 12,
    store_name: "Sample Store",
    show_verified_badge: 1,
    image_url: null,
    average_rating: 4.5,
    review_count: 8
};

describe("accessibility (axe) - key entry points", () => {
    it("HomeCarousel has no violations", async () => {
        const { container } = render(withProviders(<HomeCarousel />));
        await screen.findByRole("button", { name: "Next slide" });
        expect(await axe(container)).toHaveNoViolations();
    });

    it("ProductCard has no violations in the grid and list layouts", async () => {
        const { container } = render(
            withProviders(
                <>
                    <ProductCard product={product} />
                    <ProductCard product={product} layout="list" />
                </>
            )
        );
        expect(await axe(container)).toHaveNoViolations();
    });

    it("Login has no violations", async () => {
        const { container } = render(withProviders(<Login />));
        expect(await axe(container)).toHaveNoViolations();
    });

    it("Register has no violations", async () => {
        const { container } = render(withProviders(<Register />));
        expect(await axe(container)).toHaveNoViolations();
    });

    // The seller and delivery-agent sign-ups reveal extra fields (ID
    // document, licence, vehicle) that the default buyer form hides.
    it.each(["seller", "delivery_agent"])("Register has no violations for the %s role", async (role) => {
        const user = userEvent.setup();
        const { container } = render(withProviders(<Register />));
        await user.selectOptions(container.querySelector("#register-role"), role);
        expect(await axe(container)).toHaveNoViolations();
    });
});
