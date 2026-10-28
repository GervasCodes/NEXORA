import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = vi.hoisted(() => ({
    getSale: vi.fn(), voidSale: vi.fn(), returnSale: vi.fn(), getReceipt: vi.fn(), downloadReceiptPdf: vi.fn(),
    newRequestId: vi.fn(() => "req-1234567890")
}));
vi.mock("../../../src/api/stock", () => api);
vi.mock("../../../src/api/client", () => ({ default: {}, extractErrorMessage: (e) => e?.message || "error" }));
vi.mock("../../../src/context/LanguageContext", () => ({
    useLanguage: () => ({ language: "sw", t: (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key) })
}));
vi.mock("../../../src/context/ToastContext", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import SaleDetail from "../../../src/pages/seller/stock/SaleDetail";

const sale = (over = {}) => ({
    id: 5, receipt_no: "R000005", status: "active", source: "pos", currency: "TZS", customer_name: "Asha", sold_at: "2026-10-27T08:00:00Z",
    subtotal: 7000, discount_amount: 0, total_amount: 7000, returned_amount: 0, net_amount: 7000, paid_amount: 7000, balance: 0,
    payment_method: "cash", is_backdated: false, void_reason: null,
    lines: [
        { id: 11, stock_item_id: 1, item_name: "Bag", variant_label: null, quantity: 2, returned_quantity: 0, unit_price: 2500, line_total: 5000 },
        { id: 12, stock_item_id: 2, item_name: "Hat", variant_label: null, quantity: 2, returned_quantity: 0, unit_price: 1000, line_total: 2000 }
    ], returns: [], payments: [], ...over
});

const renderPage = () => render(
    <MemoryRouter initialEntries={["/seller/stock/sales/5"]}>
        <Routes><Route path="/seller/stock/sales/:id" element={<SaleDetail />} /></Routes>
    </MemoryRouter>
);

describe("SaleDetail", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.getSale.mockResolvedValue(sale());
    });

    it("shows the receipt, and always says it is not a fiscal receipt", async () => {
        renderPage();
        expect(await screen.findByText(/R000005/)).toBeInTheDocument();
        expect(screen.getByText("stock.trade.notFiscal")).toBeInTheDocument();
        expect(screen.getByText("Bag")).toBeInTheDocument();
    });

    it("needs a reason before cancelling, then cancels and shows the cancelled sale", async () => {
        api.voidSale.mockResolvedValue(sale({ status: "voided", void_reason: "Wrong item" }));
        renderPage();
        await screen.findByText(/R000005/);
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.cancelSale" }));
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.confirmVoid" }));
        expect(await screen.findByText("stock.trade.reasonNeeded")).toBeInTheDocument();
        expect(api.voidSale).not.toHaveBeenCalled();

        await userEvent.type(screen.getByLabelText("stock.trade.voidReason"), "Wrong item");
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.confirmVoid" }));
        await waitFor(() => expect(api.voidSale).toHaveBeenCalledWith(5, { reason: "Wrong item" }));
        expect(await screen.findByText('stock.trade.voidedBecause:{"reason":"Wrong item"}')).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "stock.trade.cancelSale" })).not.toBeInTheDocument();
    });

    it("sends only the lines with a quantity, with a request id", async () => {
        api.returnSale.mockResolvedValue({ sale: sale({ returned_amount: 2500, net_amount: 4500 }), replayed: false });
        renderPage();
        await screen.findByText(/R000005/);
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.returnItems" }));
        await userEvent.type(screen.getByLabelText('stock.trade.returnQty:{"name":"Bag"}'), "1");
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.recordReturn" }));
        await waitFor(() => expect(api.returnSale).toHaveBeenCalled());
        expect(api.returnSale).toHaveBeenCalledWith(5, { lines: [{ sale_line_id: 11, quantity: 1 }], reason: undefined, idempotency_key: "req-1234567890" });
    });

    it("refuses an empty return without calling the API", async () => {
        renderPage();
        await screen.findByText(/R000005/);
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.returnItems" }));
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.recordReturn" }));
        expect(await screen.findByText("stock.trade.chooseReturn")).toBeInTheDocument();
        expect(api.returnSale).not.toHaveBeenCalled();
    });

    it("offers no cancel or return on a cancelled sale or one from the old screen", async () => {
        api.getSale.mockResolvedValue(sale({ source: "legacy" }));
        renderPage();
        await screen.findByText(/R000005/);
        expect(screen.queryByRole("button", { name: "stock.trade.cancelSale" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "stock.trade.returnItems" })).not.toBeInTheDocument();
    });

    it("asks for the receipt in the user's language when sharing", async () => {
        api.getReceipt.mockResolvedValue({ sale: { receipt_no: "R000005" }, share_text: "hello" });
        const open = vi.spyOn(window, "open").mockReturnValue(null);
        renderPage();
        await screen.findByText(/R000005/);
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.shareReceipt" }));
        await waitFor(() => expect(api.getReceipt).toHaveBeenCalledWith("5", "sw"));
        expect(open).toHaveBeenCalledWith(expect.stringContaining("wa.me/?text=hello"), "_blank", "noopener,noreferrer");
        open.mockRestore();
    });
});
