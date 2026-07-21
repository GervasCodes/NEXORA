import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../src/api/client", () => ({
    default: { post: vi.fn() },
    extractErrorMessage: (error) => error?.response?.data?.message || "Something went wrong. Please try again"
}));

const mockRefresh = vi.fn();
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
            "common.browseMarketplace": "Browse the marketplace",
            "common.total": "Total",
            "checkout.title": "Checkout",
            "checkout.placingOrder": "Placing order…",
            "checkout.placeOrderButton": "Place order"
        }[key] || key)
    })
}));

// LocationPicker pulls in react-leaflet/leaflet, which isn't relevant to
// checkout submission behavior - stub it down to a simple control that
// still exercises the onChange contract the real component honors.
vi.mock("../../src/components/LocationPicker", () => ({
    default: ({ onChange }) => (
        <button type="button" onClick={() => onChange({ lat: -6.8, lng: 39.2 })}>Drop pin</button>
    )
}));

import api, { extractErrorMessage } from "../../src/api/client";
import Checkout from "../../src/pages/Checkout";

const renderCheckout = () => render(<MemoryRouter><Checkout /></MemoryRouter>);

const cartWithItems = {
    items: [{ cart_item_id: 1, product_id: 10, name: "Crochet Bag", quantity: 2, subtotal: 10000 }],
    total: 10000,
    refresh: mockRefresh
};

// The address/city/region/phone <label> elements aren't wired to their
// <input> via htmlFor/id in the markup, so they aren't accessible-name
// associated - select by document order (address, city, region, phone)
// instead of getByLabelText for these four fields.
const fillRequiredFields = async (user) => {
    const [address, city, region, phone] = screen.getAllByRole("textbox");
    await user.type(address, "123 Uhuru St");
    await user.type(city, "Dar es Salaam");
    await user.type(region, "Dar es Salaam");
    await user.type(phone, "0712345678");
};

const originalLocation = window.location;

beforeEach(() => {
    mockNavigate.mockClear();
    mockRefresh.mockClear();
    mockUseCart.mockReset();
    api.post.mockReset();
    delete window.location;
    window.location = { ...originalLocation, href: "", origin: "https://nexora.tz" };
});

describe("Checkout page", () => {
    it("shows an empty-cart message with a link back to the marketplace when the cart is empty", () => {
        mockUseCart.mockReturnValue({ items: [], total: 0, refresh: mockRefresh });

        renderCheckout();

        expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
        expect(screen.getByText("Browse the marketplace")).toHaveAttribute("href", "/");
    });

    it("renders the order summary with every cart item and the total", () => {
        mockUseCart.mockReturnValue(cartWithItems);

        renderCheckout();

        expect(screen.getByText(/Crochet Bag × 2/)).toBeInTheDocument();
        expect(screen.getAllByText("TZS 10000").length).toBeGreaterThan(0);
    });

    it("places a mobile money order: creates the order, initiates payment, refreshes the cart, and navigates to the order page", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        api.post
            .mockResolvedValueOnce({ data: { data: { orderId: 55 } } }) // POST /orders
            .mockResolvedValueOnce({}); // POST /payments/55/initiate
        const user = userEvent.setup();
        renderCheckout();
        await fillRequiredFields(user);

        await user.click(screen.getByRole("button", { name: /Place order/ }));

        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/orders/55", { state: { justPlaced: true } }));
        expect(api.post).toHaveBeenNthCalledWith(1, "/orders", expect.objectContaining({
            shipping_address: "123 Uhuru St",
            shipping_city: "Dar es Salaam",
            shipping_region: "Dar es Salaam",
            shipping_phone: "0712345678",
            payment_method: "mobile_money",
            delivery_lat: null,
            delivery_lng: null
        }));
        expect(api.post).toHaveBeenNthCalledWith(2, "/payments/55/initiate");
        expect(mockRefresh).toHaveBeenCalled();
    });

    it("includes the dropped delivery pin's coordinates in the order payload", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        api.post
            .mockResolvedValueOnce({ data: { data: { orderId: 55 } } })
            .mockResolvedValueOnce({});
        const user = userEvent.setup();
        renderCheckout();
        await fillRequiredFields(user);
        await user.click(screen.getByText("Drop pin"));

        await user.click(screen.getByRole("button", { name: /Place order/ }));

        await waitFor(() => expect(api.post).toHaveBeenCalledWith("/orders", expect.objectContaining({
            delivery_lat: -6.8,
            delivery_lng: 39.2
        })));
    });

    it("places a cash-on-delivery order without calling any payment-initiation endpoint", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        api.post.mockResolvedValueOnce({ data: { data: { orderId: 56 } } });
        const user = userEvent.setup();
        renderCheckout();
        await fillRequiredFields(user);
        await user.click(screen.getByLabelText("Cash on Delivery"));

        await user.click(screen.getByRole("button", { name: /Place order/ }));

        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/orders/56", { state: { justPlaced: true } }));
        expect(api.post).toHaveBeenCalledTimes(1);
    });

    it("redirects to the Snippe checkout URL and does not navigate to the order page", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        api.post
            .mockResolvedValueOnce({ data: { data: { orderId: 57 } } })
            .mockResolvedValueOnce({ data: { data: { url: "https://pay.snippe.sh/session/abc" } } });
        const user = userEvent.setup();
        renderCheckout();
        await fillRequiredFields(user);
        await user.click(screen.getByLabelText(/Card \(Snippe\)/));

        await user.click(screen.getByRole("button", { name: /Place order/ }));

        await waitFor(() => expect(window.location.href).toBe("https://pay.snippe.sh/session/abc"));
        expect(api.post).toHaveBeenNthCalledWith(2, "/payments/57/snippe/checkout", {
            successUrl: "https://nexora.tz/orders/57?payment=success",
            cancelUrl: "https://nexora.tz/orders/57?payment=cancelled"
        });
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("redirects to the PayPal approval URL and does not navigate to the order page", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        api.post
            .mockResolvedValueOnce({ data: { data: { orderId: 58 } } })
            .mockResolvedValueOnce({ data: { data: { url: "https://paypal.com/checkoutnow?token=xyz" } } });
        const user = userEvent.setup();
        renderCheckout();
        await fillRequiredFields(user);
        await user.click(screen.getByLabelText(/PayPal/));

        await user.click(screen.getByRole("button", { name: /Place order/ }));

        await waitFor(() => expect(window.location.href).toBe("https://paypal.com/checkoutnow?token=xyz"));
        expect(api.post).toHaveBeenNthCalledWith(2, "/payments/58/paypal/create", {
            returnUrl: "https://nexora.tz/orders/58?payment=paypal_return",
            cancelUrl: "https://nexora.tz/orders/58?payment=cancelled"
        });
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("shows an error message and re-enables the submit button when order creation fails", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        api.post.mockRejectedValueOnce({ response: { data: { message: "Out of stock" } } });
        const user = userEvent.setup();
        renderCheckout();
        await fillRequiredFields(user);

        const submitButton = screen.getByRole("button", { name: /Place order/ });
        await user.click(submitButton);

        await waitFor(() => expect(screen.getByText("Out of stock")).toBeInTheDocument());
        expect(submitButton).not.toBeDisabled();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("uses the generic fallback message when the error response has no message", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        api.post.mockRejectedValueOnce({});
        const user = userEvent.setup();
        renderCheckout();
        await fillRequiredFields(user);

        await user.click(screen.getByRole("button", { name: /Place order/ }));

        await waitFor(() => expect(screen.getByText(extractErrorMessage({}))).toBeInTheDocument());
    });
});
