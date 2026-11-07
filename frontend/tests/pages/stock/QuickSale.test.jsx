import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = vi.hoisted(() => ({
    lookupStockItems: vi.fn(),
    createSale: vi.fn(),
    listCustomers: vi.fn(),
    createCustomer: vi.fn(),
    newRequestId: vi.fn(() => "req-1234567890")
}));
vi.mock("../../../src/api/stock", () => api);
vi.mock("../../../src/api/client", () => ({ default: {}, extractErrorMessage: (e) => e?.message || "error" }));
vi.mock("../../../src/context/LanguageContext", () => ({
    useLanguage: () => ({ t: (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key) })
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("../../../src/context/ToastContext", () => ({ useToast: () => toast }));

import QuickSale from "../../../src/pages/seller/stock/QuickSale";

const bag = { id: 1, source: "external", name: "Bag", variant_label: null, sku: "B1", barcode: "6001", sell_price: 2500, cost_price: 1000, stock: 8 };
const hat = { id: 2, source: "nexora", name: "Hat", variant_label: "Red", sku: null, barcode: null, sell_price: 1000, cost_price: null, stock: 1 };

const renderPage = () => render(
    <MemoryRouter initialEntries={["/seller/stock/sell"]}>
        <Routes>
            <Route path="/seller/stock/sell" element={<QuickSale />} />
            <Route path="/seller/stock/sales/:id" element={<p>receipt page</p>} />
        </Routes>
    </MemoryRouter>
);

const search = async (text) => userEvent.type(screen.getByLabelText("stock.trade.searchItem"), text);

describe("QuickSale", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.lookupStockItems.mockResolvedValue([bag, hat]);
        api.listCustomers.mockResolvedValue({ items: [{ id: 7, name: "Asha", owed: 0 }] });
        api.createSale.mockResolvedValue({ replayed: false, sale: { id: 55 } });
    });

    it("adds items, totals with a discount, and sends prices, quantities and a request id", async () => {
        renderPage();
        await userEvent.click(await screen.findByText("Bag"));
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.more" }));
        await userEvent.click(await screen.findByText("Hat"));
        await userEvent.type(screen.getByLabelText("stock.trade.discount"), "500");
        // 2 x 2500 + 1 x 1000 - 500 = 5500
        expect(screen.getAllByText("TZS 5,500").length).toBeGreaterThan(0);

        await userEvent.click(screen.getByRole("button", { name: "stock.trade.recordSale" }));
        await waitFor(() => expect(api.createSale).toHaveBeenCalled());
        expect(api.createSale).toHaveBeenCalledWith(expect.objectContaining({
            lines: [{ item_id: 1, quantity: 2, unit_price: 2500 }, { item_id: 2, quantity: 1, unit_price: 1000 }],
            discount: 500, payment_method: "cash", idempotency_key: "req-1234567890"
        }));
        expect(await screen.findByText("receipt page")).toBeInTheDocument();
    });

    it("an Enter on an exact barcode adds that item (scanner)", async () => {
        api.lookupStockItems.mockResolvedValue([bag]);
        renderPage();
        await search("6001{Enter}");
        expect(await screen.findByRole("button", { name: "stock.trade.more" })).toBeInTheDocument();
        expect(screen.getByDisplayValue("2500")).toBeInTheDocument();
    });

    it("warns when the quantity is more than the stock", async () => {
        renderPage();
        await userEvent.click(await screen.findByText("Hat"));
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.more" }));
        expect(screen.getByText('stock.trade.onlyHave:{"count":1}')).toBeInTheDocument();
    });

    it("a credit sale needs a customer and sends the part-payment", async () => {
        renderPage();
        await userEvent.click(await screen.findByText("Bag"));
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.method.credit" }));
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.recordSale" }));
        expect(await screen.findByText("stock.trade.creditNeedsCustomer")).toBeInTheDocument();
        expect(api.createSale).not.toHaveBeenCalled();

        await userEvent.selectOptions(screen.getByLabelText(/stock.trade.customer/), "7");
        await userEvent.type(screen.getByLabelText("stock.trade.paidNow"), "1000");
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.recordSale" }));
        await waitFor(() => expect(api.createSale).toHaveBeenCalled());
        expect(api.createSale).toHaveBeenCalledWith(expect.objectContaining({
            payment_method: "credit", customer_id: 7, amount_paid: 1000, paid_via: "cash"
        }));
    });

    it("shows the server's message when the sale is refused and stays on the page", async () => {
        api.createSale.mockRejectedValue(Object.assign(new Error("Not enough stock - only 1 in stock."), { response: { status: 409 } })); // a real server answer (no response = no connection, which queues the sale instead)
        renderPage();
        await userEvent.click(await screen.findByText("Hat"));
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.recordSale" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Not enough stock");
        expect(screen.queryByText("receipt page")).not.toBeInTheDocument();
    });

    it("keeps the record button off until something is in the cart", async () => {
        renderPage();
        await screen.findByText("Bag");
        expect(screen.getByRole("button", { name: "stock.trade.recordSale" })).toBeDisabled();
    });
});
