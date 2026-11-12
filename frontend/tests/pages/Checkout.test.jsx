import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../src/api/client", () => ({
    // Checkout also calls api.get("/payments/methods") on mount (Phase 5's
    // provider-gating lookup). It fails open on any rejection - leaving
    // every payment method visible - which is what every test below
    // already assumes, so a plain rejected mock keeps that behavior
    // without needing per-test setup.
    default: { post: vi.fn(), get: vi.fn(() => Promise.reject(new Error("not mocked"))) },
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

// Checkout surfaces order-submission failures via the shared toast (see
// ToastContext.jsx) rather than an inline banner - assert against this spy
// instead of DOM text.
const mockToastError = vi.fn();
vi.mock("../../src/context/ToastContext", () => ({
    useToast: () => ({ error: mockToastError, success: vi.fn(), info: vi.fn() })
}));

vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({
        t: (key) => ({
            "cart.empty": "Your cart is empty",
            "common.browseMarketplace": "Browse the marketplace",
            "common.total": "Total",
            "checkout.title": "Checkout",
            "checkout.placingOrder": "Placing order…",
            "checkout.placeOrderButton": "Place order",
            "checkout.landmarkNear": "Near"
        }[key] || key)
    })
}));

// LocationPicker pulls in react-leaflet/leaflet, which isn't relevant to
// checkout submission behavior - stub it down to a simple control that
// still exercises the onChange contract the real component honors.
vi.mock("../../src/components/LocationPicker", () => ({
    default: ({ onChange, onAddressResolved }) => (
        <>
            <button type="button" onClick={() => onChange({ lat: -6.8, lng: 39.2 })}>Drop pin</button>
            <button
                type="button"
                onClick={() => onAddressResolved?.({ address: "Kinondoni Rd", city: "Dar es Salaam", region: "Dar es Salaam" })}
            >
                Resolve address
            </button>
        </>
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
    const [address, city, region, landmark, phone] = screen.getAllByRole("textbox");
    await user.type(address, "123 Uhuru St");
    await user.type(city, "Dar es Salaam");
    await user.type(region, "Dar es Salaam");
    await user.type(landmark, "Opposite Shell petrol");
    await user.type(phone, "0712345678");
    // Phase 2 consent gate: the submit button stays disabled until the
    // buyer explicitly accepts the Terms/Privacy/Refund policies.
    await user.click(screen.getByLabelText(/I agree to the/));
};

// Checkout.jsx renders two "Place order" submit buttons - one in the
// desktop summary column, one in the mobile sticky bar - shown/hidden
// via Tailwind responsive classes rather than removed from the DOM, so
// jsdom (which doesn't apply the actual stylesheet) sees both as
// visible. Both submit the same form, so picking the first is enough.
const placeOrderButton = () => screen.getAllByRole("button", { name: /Place order/ })[0];

const originalLocation = window.location;

beforeEach(() => {
    mockNavigate.mockClear();
    mockRefresh.mockClear();
    mockUseCart.mockReset();
    mockToastError.mockClear();
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

    // Phase 3 (Accessibility & Internationalization): checkout is one of
    // the three flows named for the manual screen-reader audit. Automated
    // axe-core scanning catches the class of issue a screen-reader pass
    // would surface first - unlabeled fields, missing form structure,
    // contrast/ARIA violations - as a fast, repeatable check; it's a
    // complement to a manual pass, not a replacement for one (axe can't
    // judge whether the reading order or announced flow actually makes
    // sense to a real screen-reader user).
    it("has no detectable accessibility violations on the filled checkout form", async () => {
        mockUseCart.mockReturnValue(cartWithItems);

        const { container } = renderCheckout();

        const results = await axe(container);
        expect(results).toHaveNoViolations();
    });

    it("places a mobile money order: creates the order, initiates payment, refreshes the cart, and navigates to the order-confirmation page", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        api.post
            .mockResolvedValueOnce({ data: { data: { orderId: 55 } } }) // POST /orders
            .mockResolvedValueOnce({}); // POST /payments/55/initiate
        const user = userEvent.setup();
        renderCheckout();
        await fillRequiredFields(user);

        await user.click(placeOrderButton());

        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/order-confirmed/55", { replace: true }));
        expect(api.post).toHaveBeenNthCalledWith(1, "/orders", expect.objectContaining({
            // the landmark rides inside the address text (no landmark column)
            shipping_address: "123 Uhuru St - Near: Opposite Shell petrol",
            shipping_city: "Dar es Salaam",
            shipping_region: "Dar es Salaam",
            shipping_phone: "+255712345678",
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

        await user.click(placeOrderButton());

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

        await user.click(placeOrderButton());

        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/order-confirmed/56", { replace: true }));
        expect(api.post).toHaveBeenCalledTimes(1);
    });

    it("redirects to the card checkout URL and does not navigate to the order page", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        api.post
            .mockResolvedValueOnce({ data: { data: { orderId: 57 } } })
            .mockResolvedValueOnce({ data: { data: { url: "https://pay.example/session/abc" } } });
        const user = userEvent.setup();
        renderCheckout();
        await fillRequiredFields(user);
        await user.click(screen.getByLabelText(/Card/));

        await user.click(placeOrderButton());

        await waitFor(() => expect(window.location.href).toBe("https://pay.example/session/abc"));
        expect(api.post).toHaveBeenNthCalledWith(2, "/payments/57/card/checkout", {
            successUrl: "https://nexora.tz/order-confirmed/57?payment=success",
            cancelUrl: "https://nexora.tz/orders/57?payment=cancelled"
        });
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("blocks the screen with the full-screen loader during the gateway hand-off", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        api.post
            .mockResolvedValueOnce({ data: { data: { orderId: 59 } } })
            .mockResolvedValueOnce({ data: { data: { url: "https://pay.example/session/def" } } });
        const user = userEvent.setup();
        renderCheckout();
        await fillRequiredFields(user);
        await user.click(screen.getByLabelText(/Card/));

        await user.click(placeOrderButton());

        const overlay = await screen.findByRole("alertdialog");
        expect(overlay).toHaveAttribute("aria-busy", "true");
        expect(overlay).toHaveAttribute("aria-label", expect.stringContaining("redirectingToPayment"));
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

        await user.click(placeOrderButton());

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

        const submitButton = placeOrderButton();
        await user.click(submitButton);

        await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Out of stock"));
        expect(submitButton).not.toBeDisabled();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("uses the generic fallback message when the error response has no message", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        api.post.mockRejectedValueOnce({});
        const user = userEvent.setup();
        renderCheckout();
        await fillRequiredFields(user);

        await user.click(placeOrderButton());

        await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(extractErrorMessage({})));
    });
});

// Phase 6 form-error pattern. The mocked t() above returns the key for
// anything it does not list, so messages are asserted by key.
describe("Checkout page - field errors", () => {
    const fillAddressAndPhone = async (user) => {
        const [address, city, region, landmark, phone] = screen.getAllByRole("textbox");
        await user.type(address, "123 Uhuru St");
        await user.type(city, "Dar es Salaam");
        await user.type(region, "Dar es Salaam");
        await user.type(landmark, "Opposite Shell petrol");
        await user.type(phone, "0712345678");
    };

    it("keeps the place-order button enabled and explains every empty field on submit", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        const user = userEvent.setup();
        renderCheckout();

        expect(placeOrderButton()).not.toBeDisabled();
        await user.click(placeOrderButton());

        expect(api.post).not.toHaveBeenCalled();
        const [address, city, region, landmark, phone] = screen.getAllByRole("textbox");
        for (const field of [address, city, region, landmark, phone]) {
            expect(field).toHaveAttribute("aria-invalid", "true");
        }
        expect(screen.getByText("checkout.error.addressRequired")).toBeInTheDocument();
        expect(screen.getByText("checkout.error.cityRequired")).toBeInTheDocument();
        expect(screen.getByText("checkout.error.regionRequired")).toBeInTheDocument();
        expect(screen.getByText("checkout.error.landmarkRequired")).toBeInTheDocument();
        expect(screen.getByText("checkout.error.phoneRequired")).toBeInTheDocument();
        expect(screen.getByText("checkout.error.termsRequired")).toBeInTheDocument();
        await waitFor(() => expect(address).toHaveFocus());
    });

    it("asks for the Terms in-line (no toast) and focuses the checkbox when only that is missing", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        const user = userEvent.setup();
        renderCheckout();
        await fillAddressAndPhone(user);

        await user.click(placeOrderButton());

        const terms = screen.getByLabelText(/I agree to the/);
        expect(api.post).not.toHaveBeenCalled();
        expect(mockToastError).not.toHaveBeenCalled();
        expect(terms).toHaveAttribute("aria-invalid", "true");
        expect(terms).toHaveAttribute("aria-describedby", screen.getByText("checkout.error.termsRequired").id);
        await waitFor(() => expect(terms).toHaveFocus());

        await user.click(terms);
        expect(screen.queryByText("checkout.error.termsRequired")).not.toBeInTheDocument();
        expect(terms).not.toHaveAttribute("aria-invalid");
    });

    it("shows the phone-format message under the phone field and blocks the order", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        const user = userEvent.setup();
        renderCheckout();
        const [address, city, region, landmark, phone] = screen.getAllByRole("textbox");
        await user.type(address, "123 Uhuru St");
        await user.type(city, "Dar es Salaam");
        await user.type(region, "Dar es Salaam");
        await user.type(landmark, "Opposite Shell petrol");
        await user.type(phone, "712");
        await user.click(screen.getByLabelText(/I agree to the/));

        await user.click(placeOrderButton());

        expect(api.post).not.toHaveBeenCalled();
        expect(screen.getByText("checkout.phoneInvalid")).toBeInTheDocument();
        expect(phone).toHaveAttribute("aria-invalid", "true");
        await waitFor(() => expect(phone).toHaveFocus());
    });

    it("clears a field's message as soon as it is edited", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        const user = userEvent.setup();
        renderCheckout();

        await user.click(placeOrderButton());
        const [address] = screen.getAllByRole("textbox");
        expect(address).toHaveAttribute("aria-invalid", "true");

        await user.type(address, "1");

        expect(address).not.toHaveAttribute("aria-invalid");
        expect(screen.queryByText("checkout.error.addressRequired")).not.toBeInTheDocument();
    });
});

// Phase 7: location autofill, confirm-address step, landmark fallback.
describe("Checkout page - location autofill", () => {
    it("requires a landmark for a typed address but not for one suggested from the pin", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        const user = userEvent.setup();
        renderCheckout();

        // Typed address: the label carries the required asterisk.
        expect(screen.getByLabelText(/^checkout\.landmark\*/)).toBeInTheDocument();

        // Suggested from the pin: landmark becomes optional (exact label, no asterisk).
        await user.click(screen.getByText("Resolve address"));
        expect(screen.getAllByRole("textbox")[0]).toHaveValue("Kinondoni Rd");
        expect(screen.getByLabelText("checkout.landmark")).toBeInTheDocument();
        await user.click(placeOrderButton());
        expect(screen.queryByText("checkout.error.landmarkRequired")).not.toBeInTheDocument();
    });

    it("makes the buyer confirm a suggested address before ordering, then sends it", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        api.post
            .mockResolvedValueOnce({ data: { data: { orderId: 77 } } })
            .mockResolvedValueOnce({});
        const user = userEvent.setup();
        renderCheckout();
        await user.click(screen.getByText("Resolve address"));
        const [, , , , phone] = screen.getAllByRole("textbox");
        await user.type(phone, "0712345678");
        await user.click(screen.getByLabelText(/I agree to the/));

        await user.click(placeOrderButton());

        const confirm = screen.getByLabelText("checkout.addressConfirm.label");
        expect(api.post).not.toHaveBeenCalled();
        expect(screen.getByText("checkout.error.addressConfirmRequired")).toBeInTheDocument();
        expect(confirm).toHaveAttribute("aria-invalid", "true");
        await waitFor(() => expect(confirm).toHaveFocus());

        await user.click(confirm);
        await user.click(placeOrderButton());

        await waitFor(() => expect(api.post).toHaveBeenNthCalledWith(1, "/orders", expect.objectContaining({
            shipping_address: "Kinondoni Rd",
            shipping_city: "Dar es Salaam",
            shipping_region: "Dar es Salaam"
        })));
        expect(api.post.mock.calls[0][1]).not.toHaveProperty("shipping_landmark");
    });

    it("asks for confirmation again when the pin is moved and the address is re-suggested", async () => {
        mockUseCart.mockReturnValue(cartWithItems);
        const user = userEvent.setup();
        renderCheckout();
        await user.click(screen.getByText("Resolve address"));
        const confirm = screen.getByLabelText("checkout.addressConfirm.label");
        await user.click(confirm);
        expect(confirm).toBeChecked();

        await user.click(screen.getByText("Resolve address"));

        expect(screen.getByLabelText("checkout.addressConfirm.label")).not.toBeChecked();
    });
});
