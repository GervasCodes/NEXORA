import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { axe } from "jest-axe";

vi.mock("../../src/api/client", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../src/context/SocketContext", () => ({ useSocket: () => mockSocket }));
vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({ t: (key, vars) => (vars?.number ? `${key}|${vars.number}` : key) })
}));
vi.mock("../../src/context/CurrencyContext", () => ({ useCurrency: () => ({ format: (n) => `TZS ${n}` }) }));
vi.mock("../../src/context/ToastContext", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("../../src/utils/analytics", () => ({ trackPurchase: vi.fn() }));
vi.mock("../../src/components/PageMeta", () => ({ default: ({ title, noIndex }) => <div data-testid="meta" data-noindex={String(Boolean(noIndex))}>{title}</div> }));

import api from "../../src/api/client";
import { trackPurchase } from "../../src/utils/analytics";
import OrderConfirmed from "../../src/pages/OrderConfirmed";

const mockSocket = { socket: null, connected: false };

const makeOrder = (overrides = {}) => ({
    id: 55,
    order_number: "NX-1001",
    status: "pending",
    payment_status: "paid",
    payment_method: "wallet",
    total_amount: 45000,
    created_at: new Date().toISOString(),
    shipping_address: "123 Uhuru St",
    shipping_city: "Dar es Salaam",
    shipping_region: "Dar es Salaam",
    items: [{ id: 1, name: "Kitenge dress", quantity: 2, subtotal: 40000 }, { id: 2, name: "Sandals", quantity: 1, subtotal: 5000 }],
    ...overrides
});

const LocationProbe = () => <div data-testid="location">{useLocation().pathname}</div>;

const renderPage = () => render(
    <MemoryRouter initialEntries={["/order-confirmed/55"]}>
        <Routes>
            <Route path="/order-confirmed/:id" element={<OrderConfirmed />} />
            <Route path="/orders/:id" element={<LocationProbe />} />
            <Route path="/orders" element={<LocationProbe />} />
        </Routes>
    </MemoryRouter>
);

beforeEach(() => {
    api.get.mockReset();
    trackPurchase.mockReset();
    mockSocket.socket = null;
    mockSocket.connected = false;
});
afterEach(() => vi.useRealTimers());

describe("OrderConfirmed", () => {
    it("shows the order summary, total, address and next steps for a paid order", async () => {
        api.get.mockResolvedValue({ data: { data: makeOrder() } });
        renderPage();

        expect(await screen.findByRole("heading", { level: 1, name: "orderConfirmed.title.confirmed" })).toBeInTheDocument();
        expect(screen.getByText("orderConfirmed.body.confirmed|NX-1001")).toBeInTheDocument();
        expect(screen.getByText("Kitenge dress × 2")).toBeInTheDocument();
        expect(screen.getByText("Sandals × 1")).toBeInTheDocument();
        expect(screen.getByText("TZS 45000")).toBeInTheDocument();
        expect(screen.getByText("123 Uhuru St, Dar es Salaam, Dar es Salaam")).toBeInTheDocument();
        expect(screen.getByText("orderConfirmed.payment.paid")).toBeInTheDocument();
        expect(screen.getByText("orderConfirmed.next.delivery")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/orders/55");
    });

    it("links to tracking and the order, and is not indexable", async () => {
        api.get.mockResolvedValue({ data: { data: makeOrder() } });
        renderPage();

        const track = await screen.findByRole("link", { name: "order.placed.track" });
        expect(track).toHaveAttribute("href", "/orders/55/tracking");
        expect(screen.getByRole("link", { name: "orderConfirmed.viewOrder" })).toHaveAttribute("href", "/orders/55");
        expect(screen.getByRole("link", { name: "orderConfirmed.continue" })).toHaveAttribute("href", "/");
        expect(screen.getByTestId("meta")).toHaveAttribute("data-noindex", "true");
    });

    it("copies the tracking link when the browser has no native share", async () => {
        api.get.mockResolvedValue({ data: { data: makeOrder() } });
        const user = userEvent.setup();
        const writeText = vi.fn().mockResolvedValue();
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
        renderPage();

        await user.click(await screen.findByRole("button", { name: "order.placed.share" }));

        expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/orders/55/tracking`);
    });

    it("reports one purchase for a confirmed order", async () => {
        api.get.mockResolvedValue({ data: { data: makeOrder() } });
        renderPage();

        await screen.findByRole("heading", { level: 1 });
        await waitFor(() => expect(trackPurchase).toHaveBeenCalledWith({ orderId: 55, value: 45000, currency: "TZS", paymentType: "wallet" }));
    });

    it("reports a purchase for cash on delivery and shows the pay-on-delivery step", async () => {
        api.get.mockResolvedValue({ data: { data: makeOrder({ payment_status: "unpaid", payment_method: "cash_on_delivery" }) } });
        renderPage();

        expect(await screen.findByText("orderConfirmed.payment.cod")).toBeInTheDocument();
        expect(screen.getByText("orderConfirmed.next.cod")).toBeInTheDocument();
        await waitFor(() => expect(trackPurchase).toHaveBeenCalledTimes(1));
    });

    it("shows a waiting state and reports no purchase while an online payment is outstanding", async () => {
        api.get.mockResolvedValue({ data: { data: makeOrder({ payment_status: "unpaid", payment_method: "mobile_money" }) } });
        renderPage();

        expect(await screen.findByRole("heading", { level: 1, name: "orderConfirmed.title.awaiting" })).toBeInTheDocument();
        expect(screen.getByText("checkout.next.mobileMoney")).toBeInTheDocument();
        expect(trackPurchase).not.toHaveBeenCalled();
    });

    it("polls, then switches to confirmed and reports the purchase once payment lands", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        api.get
            .mockResolvedValueOnce({ data: { data: makeOrder({ payment_status: "unpaid", payment_method: "mobile_money" }) } })
            .mockResolvedValue({ data: { data: makeOrder({ payment_status: "paid", payment_method: "mobile_money" }) } });
        renderPage();

        await screen.findByRole("heading", { level: 1, name: "orderConfirmed.title.awaiting" });
        await act(async () => { await vi.advanceTimersByTimeAsync(3100); });

        expect(await screen.findByRole("heading", { level: 1, name: "orderConfirmed.title.confirmed" })).toBeInTheDocument();
        expect(trackPurchase).toHaveBeenCalledTimes(1);
    });

    it("goes to the order page, not the thank-you, when the live payment event says it failed", async () => {
        const handlers = {};
        mockSocket.socket = { on: (event, cb) => { handlers[event] = cb; }, off: vi.fn() };
        mockSocket.connected = true;
        api.get.mockResolvedValue({ data: { data: makeOrder({ payment_status: "unpaid", payment_method: "mobile_money" }) } });
        renderPage();
        await screen.findByRole("heading", { level: 1 });

        act(() => handlers["payment:updated"]({ orderId: 55, success: false }));

        expect(await screen.findByTestId("location")).toHaveTextContent("/orders/55");
        expect(trackPurchase).not.toHaveBeenCalled();
    });

    it("redirects a cancelled order to the order page", async () => {
        api.get.mockResolvedValue({ data: { data: makeOrder({ status: "cancelled" }) } });
        renderPage();

        expect(await screen.findByTestId("location")).toHaveTextContent("/orders/55");
        expect(trackPurchase).not.toHaveBeenCalled();
    });

    it("lists a multi-vendor order's items and links to the order instead of tracking", async () => {
        api.get.mockResolvedValue({ data: { data: makeOrder({ is_parent: 1, items: undefined, children: [{ id: 56, items: [{ id: 9, name: "Soap", quantity: 3, subtotal: 6000 }] }, { id: 57, items: [{ id: 10, name: "Basket", quantity: 1, subtotal: 9000 }] }] }) } });
        renderPage();

        expect(await screen.findByText("Soap × 3")).toBeInTheDocument();
        expect(screen.getByText("Basket × 1")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "orderConfirmed.viewOrder" })).toHaveAttribute("href", "/orders/55");
        expect(screen.queryByRole("link", { name: "order.placed.track" })).not.toBeInTheDocument();
    });

    it("shows a recoverable message when the order cannot be loaded", async () => {
        api.get.mockRejectedValue(new Error("network"));
        renderPage();

        expect(await screen.findByText("orderConfirmed.loadFailed.title")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "orderConfirmed.viewOrders" })).toHaveAttribute("href", "/orders");
    });

    it("has no accessibility violations", async () => {
        api.get.mockResolvedValue({ data: { data: makeOrder() } });
        const { container } = renderPage();
        await screen.findByRole("heading", { level: 1 });

        expect(await axe(container)).toHaveNoViolations();
    });
});
