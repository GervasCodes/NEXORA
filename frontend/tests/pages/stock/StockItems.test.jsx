import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const api = vi.hoisted(() => ({
    listStockItems: vi.fn(),
    adjustStockItem: vi.fn(),
    archiveStockItem: vi.fn(),
    unarchiveStockItem: vi.fn(),
    reconcileStock: vi.fn(),
    newRequestId: vi.fn(() => "req-1234567890")
}));
vi.mock("../../../src/api/stock", () => api);
vi.mock("../../../src/api/client", () => ({ default: {}, extractErrorMessage: (e) => e?.message || "error" }));
vi.mock("../../../src/context/LanguageContext", () => ({
    useLanguage: () => ({ t: (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key) })
}));
vi.mock("../../../src/context/ToastContext", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import StockItems from "../../../src/pages/seller/stock/StockItems";

const item = (over = {}) => ({
    id: 1, source: "external", name: "Bag", variant_label: null, sku: "B1", barcode: null, unit: "pcs",
    cost_price: 500, sell_price: 1000, reorder_level: 5, stock: 3, is_low: true, is_out: false, is_archived: false, ...over
});
const listing = (items) => ({ items, total: items.length, page: 1, limit: 20, summary: { items: items.length, low_stock: 1, out_of_stock: 0, stock_value_at_cost: 1500 } });

const renderPage = () => render(<MemoryRouter initialEntries={["/seller/stock"]}><StockItems /></MemoryRouter>);

describe("StockItems", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.listStockItems.mockResolvedValue(listing([item(), item({ id: 2, name: "Phone", source: "nexora", stock: 0, is_low: false, is_out: true })]));
    });

    it("shows each item with its source badge and stock state", async () => {
        renderPage();
        expect(await screen.findByText("Bag")).toBeInTheDocument();
        expect(screen.getByText("stock.badgeExternal")).toBeInTheDocument();
        expect(screen.getByText("stock.badgeNexora")).toBeInTheDocument();
        expect(screen.getByText("stock.out")).toBeInTheDocument();
        expect(screen.getByText("stock.low")).toBeInTheDocument();
    });

    it("shows the empty state when there are no items", async () => {
        api.listStockItems.mockResolvedValue(listing([]));
        renderPage();
        expect(await screen.findByText("stock.emptyTitle")).toBeInTheDocument();
    });

    it("sends a count with the stock the screen showed as the baseline, and a request id", async () => {
        api.adjustStockItem.mockResolvedValue({ data: { replayed: false } });
        renderPage();
        await screen.findByText("Bag");
        await userEvent.click(screen.getAllByText("stock.countStock")[0]);
        await userEvent.type(screen.getByLabelText("stock.countedStock"), "9");
        await userEvent.click(screen.getByRole("button", { name: "stock.save" }));
        await waitFor(() => expect(api.adjustStockItem).toHaveBeenCalled());
        expect(api.adjustStockItem).toHaveBeenCalledWith(1, expect.objectContaining({
            type: "correction", new_stock: 9, baseline: 3, idempotency_key: "req-1234567890"
        }));
    });

    it("rejects a non-whole quantity without calling the API", async () => {
        renderPage();
        await screen.findByText("Bag");
        await userEvent.click(screen.getAllByText("stock.addStock")[0]);
        const field = screen.getByLabelText("stock.quantityAdded");
        await userEvent.type(field, "0");
        // min=1 already blocks this natively in a browser; submit directly to check our own message
        fireEvent.submit(field.closest("form"));
        expect(await screen.findByRole("alert")).toHaveTextContent("stock.unitsInvalid");
        expect(api.adjustStockItem).not.toHaveBeenCalled();
    });

    it("filters by source through the API", async () => {
        renderPage();
        await screen.findByText("Bag");
        await userEvent.click(screen.getByRole("button", { name: "stock.filter.nexora" }));
        await waitFor(() => expect(api.listStockItems).toHaveBeenLastCalledWith(expect.objectContaining({ source: "nexora" })));
    });
});
