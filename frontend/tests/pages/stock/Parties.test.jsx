import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const api = vi.hoisted(() => ({
    listCustomers: vi.fn(), createCustomer: vi.fn(), updateCustomer: vi.fn(), getCustomer: vi.fn(), receiveCustomerPayment: vi.fn(),
    listSuppliers: vi.fn(), createSupplier: vi.fn(), updateSupplier: vi.fn(), getSupplier: vi.fn(),
    newRequestId: vi.fn(() => "req-1234567890")
}));
vi.mock("../../../src/api/stock", () => api);
vi.mock("../../../src/api/client", () => ({ default: {}, extractErrorMessage: (e) => e?.message || "error" }));
vi.mock("../../../src/context/LanguageContext", () => ({
    useLanguage: () => ({ t: (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key) })
}));
vi.mock("../../../src/context/ToastContext", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import Parties from "../../../src/pages/seller/stock/Parties";

const statement = (owed) => ({ customer: { id: 7, name: "Asha", owed }, sales: [], payments: [] });

describe("Parties (customers)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.listCustomers.mockResolvedValue({ items: [{ id: 7, name: "Asha", phone: "0712", owed: 4000 }, { id: 8, name: "Juma", owed: 0 }], total: 2, total_owed: 4000 });
        api.getCustomer.mockResolvedValue(statement(4000));
    });

    it("lists customers with what they owe", async () => {
        render(<MemoryRouter><Parties kind="customer" /></MemoryRouter>);
        expect(await screen.findByText("Asha")).toBeInTheDocument();
        expect(screen.getAllByText("TZS 4,000").length).toBeGreaterThan(0);
        expect(api.listSuppliers).not.toHaveBeenCalled();
    });

    it("receives a payment with a request id and refreshes the statement", async () => {
        api.receiveCustomerPayment.mockResolvedValue({ replayed: false, statement: statement(1500) });
        render(<MemoryRouter><Parties kind="customer" /></MemoryRouter>);
        await screen.findByText("Asha");
        await userEvent.click(screen.getAllByRole("button", { name: "stock.trade.details" })[0]);
        await userEvent.type(await screen.findByLabelText("stock.trade.amount"), "2500");
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.recordPayment" }));
        await waitFor(() => expect(api.receiveCustomerPayment).toHaveBeenCalledWith(7, { amount: 2500, method: "cash", idempotency_key: "req-1234567890" }));
    });

    it("shows the server's refusal (more than owed)", async () => {
        api.receiveCustomerPayment.mockRejectedValue(new Error("The customer only owes 4000."));
        render(<MemoryRouter><Parties kind="customer" /></MemoryRouter>);
        await screen.findByText("Asha");
        await userEvent.click(screen.getAllByRole("button", { name: "stock.trade.details" })[0]);
        const amount = await screen.findByLabelText("stock.trade.amount");
        await userEvent.type(amount, "9000");
        // the field's max already stops this in a real browser; submit directly to check the server message is shown
        fireEvent.submit(amount.closest("form"));
        expect(await screen.findByRole("alert")).toHaveTextContent("only owes");
    });

    it("needs a name to add a customer", async () => {
        render(<MemoryRouter><Parties kind="customer" /></MemoryRouter>);
        await screen.findByText("Asha");
        await userEvent.click(screen.getByRole("button", { name: "stock.trade.addCustomer" }));
        await userEvent.click(screen.getByRole("button", { name: "stock.save" }));
        expect(await screen.findByText("stock.trade.nameNeeded")).toBeInTheDocument();
        expect(api.createCustomer).not.toHaveBeenCalled();
    });

    it("uses the supplier API for suppliers", async () => {
        api.listSuppliers.mockResolvedValue({ items: [], total: 0, total_owed: 0 });
        render(<MemoryRouter><Parties kind="supplier" /></MemoryRouter>);
        expect(await screen.findByText("stock.trade.noSuppliers")).toBeInTheDocument();
        expect(api.listCustomers).not.toHaveBeenCalled();
    });
});
