import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "fake-indexeddb/auto";

const api = vi.hoisted(() => ({
    lookupStockItems: vi.fn(), createSale: vi.fn(), listCustomers: vi.fn(), createCustomer: vi.fn(),
    syncOfflineSales: vi.fn(), newRequestId: vi.fn(() => "req-offline-0001")
}));
vi.mock("../../../src/api/stock", () => api);
vi.mock("../../../src/api/client", () => ({ default: {}, extractErrorMessage: (e) => e?.message || "error" }));
vi.mock("../../../src/context/LanguageContext", () => ({
    useLanguage: () => ({ t: (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key) })
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("../../../src/context/ToastContext", () => ({ useToast: () => toast }));

import QuickSale from "../../../src/pages/seller/stock/QuickSale";
import { listQueue, resetForTests, searchCachedItems } from "../../../src/utils/stockOfflineStore";

const bag = { id: 1, source: "external", name: "Bag", variant_label: null, sku: "B1", barcode: "6001", sell_price: 2500, cost_price: 1000, stock: 8 };

const renderPage = () => render(
    <MemoryRouter initialEntries={["/seller/stock/sell"]}>
        <Routes>
            <Route path="/seller/stock/sell" element={<QuickSale />} />
            <Route path="/seller/stock/sales/:id" element={<p>receipt page</p>} />
        </Routes>
    </MemoryRouter>
);

describe("QuickSale offline", () => {
    let onLine;
    beforeEach(async () => {
        vi.clearAllMocks();
        await resetForTests();
        api.lookupStockItems.mockResolvedValue([bag]);
        api.listCustomers.mockResolvedValue({ items: [] });
        onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    });
    afterEach(() => onLine.mockRestore());

    it("remembers the items it shows so they can be searched offline", async () => {
        renderPage();
        await screen.findByText("Bag");
        await waitFor(async () => expect((await searchCachedItems("bag")).length).toBe(1));
    });

    it("with no connection, saves the sale on the device with its request id and keeps the till open", async () => {
        renderPage();
        await userEvent.click(await screen.findByText("Bag"));
        onLine.mockReturnValue(false);
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.recordSale" }));

        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("stock.p8.off.savedHere"));
        expect(api.createSale).not.toHaveBeenCalled();
        const [entry] = await listQueue();
        expect(entry.key).toBe("req-offline-0001");
        expect(entry.payload).toMatchObject({ lines: [{ item_id: 1, quantity: 1, unit_price: 2500 }], payment_method: "cash" });
        expect(entry.payload.sold_at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // the till's own clock, kept for the record
        expect(screen.queryByText("receipt page")).not.toBeInTheDocument();
        expect(screen.getByText("stock.trade.emptyCart")).toBeInTheDocument(); // ready for the next customer
    });

    it("a request that never reached the server (network error) is queued with the SAME request id", async () => {
        api.createSale.mockRejectedValue(Object.assign(new Error("Network Error"), { response: undefined }));
        renderPage();
        await userEvent.click(await screen.findByText("Bag"));
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.recordSale" }));
        await waitFor(async () => expect((await listQueue()).length).toBe(1));
        expect(api.createSale.mock.calls[0][0].idempotency_key).toBe((await listQueue())[0].key);
    });

    it("a real server refusal (e.g. not enough stock) is shown and NOT queued", async () => {
        api.createSale.mockRejectedValue(Object.assign(new Error("Not enough stock - only 1 in stock."), { response: { status: 409 } }));
        renderPage();
        await userEvent.click(await screen.findByText("Bag"));
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.recordSale" }));
        expect(await screen.findByText("Not enough stock - only 1 in stock.")).toBeInTheDocument();
        expect(await listQueue()).toEqual([]);
    });
});
