import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import "fake-indexeddb/auto";

const api = vi.hoisted(() => ({
    getReport: vi.fn(), listExpenses: vi.fn(), createExpense: vi.fn(), voidExpense: vi.fn(),
    importStockItems: vi.fn(), downloadImportTemplate: vi.fn(), downloadStockCsv: vi.fn(),
    getStockAccess: vi.fn(), listStockItems: vi.fn(), syncOfflineSales: vi.fn(),
    newRequestId: vi.fn(() => "req-p8-000001")
}));
vi.mock("../../../src/api/stock", () => api);
vi.mock("../../../src/api/client", () => ({ default: {}, extractErrorMessage: (e) => e?.message || "error" }));
vi.mock("../../../src/context/LanguageContext", () => ({
    useLanguage: () => ({ language: "en", t: (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key) })
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("../../../src/context/ToastContext", () => ({ useToast: () => toast }));

import StockExpenses from "../../../src/pages/seller/stock/StockExpenses";
import StockReports from "../../../src/pages/seller/stock/StockReports";
import StockImportExport from "../../../src/pages/seller/stock/StockImportExport";
import StockLayout from "../../../src/pages/seller/stock/StockLayout";
import OfflineQueueBanner from "../../../src/pages/seller/stock/OfflineQueueBanner";
import { queueSale, resetForTests } from "../../../src/utils/stockOfflineStore";

const features = (over = {}) => ({ stock_pos: true, stock_reports: true, stock_cost_reports: true, stock_import_export: true, stock_max_items: null, ...over });
const inLayout = (ui, access = { read_only: false, features: features() }, path = "/seller/stock/x") => render(
    <MemoryRouter initialEntries={[path]}>
        <Routes><Route element={<Outlet context={{ access }} />}><Route path="/seller/stock/x" element={ui} /></Route></Routes>
    </MemoryRouter>
);

const overview = (over = {}) => ({
    from: "2026-10-01", to: "2026-10-02", timezone: "Africa/Dar_es_Salaam",
    on_platform: { orders: 2, units: 3, gross: 10000, net_revenue: 9000, commission_and_refunds: 1000 },
    off_platform: { sales: 3, units: 4, net_revenue: 8000, discounts: 0 }, combined: { net_revenue: 17000 }, expenses: 2000,
    daily: [{ day: "2026-10-01", on_platform: 9000, off_platform: 0 }, { day: "2026-10-02", on_platform: 0, off_platform: 8000 }],
    cost_locked: false, profit: { revenue: 17000, cost_of_goods: 7000, gross_profit: 10000, expenses: 2000, net_profit: 8000, cost_missing_units: 0 },
    ...over
});

describe("StockReports", () => {
    beforeEach(() => { vi.clearAllMocks(); api.getReport.mockResolvedValue(overview()); });

    it("shows on-platform and shop revenue separately, and the profit when the plan has cost reports", async () => {
        inLayout(<StockReports />);
        expect((await screen.findAllByText("TZS 9,000")).length).toBeGreaterThan(0);   // on Nexora, after commission
        expect(screen.getAllByText("TZS 8,000").length).toBeGreaterThan(0);    // in the shop
        expect(screen.getByText("stock.p8.rep.netProfit")).toBeInTheDocument();
        expect(screen.getByText("stock.p8.rep.tzNote")).toBeInTheDocument();
        expect(api.getReport).toHaveBeenCalledWith("overview", expect.objectContaining({ from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), to: expect.any(String) }));
    });

    it("without cost reports there is no profit figure, only the upgrade note", async () => {
        api.getReport.mockResolvedValue(overview({ cost_locked: true, profit: null }));
        inLayout(<StockReports />, { read_only: false, features: features({ stock_cost_reports: false }) });
        expect(await screen.findByText("stock.p8.rep.lockedTitle")).toBeInTheDocument();
        expect(screen.queryByText("stock.p8.rep.netProfit")).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("tab", { name: "stock.p8.rep.tab.valuation" }));
        expect(await screen.findByText("stock.p8.rep.lockedTitle")).toBeInTheDocument();
        expect(api.getReport).not.toHaveBeenCalledWith("valuation", expect.anything()); // never even asked
    });

    it("tabs are real tabs, one panel at a time, with the Dar es Salaam day for the daily close", async () => {
        api.getReport.mockImplementation(async (name) => (name === "low-stock"
            ? { items: [{ id: 1, name: "Oil", stock: 0, reorder_level: 5, status: "out" }], out_count: 1, low_count: 0 } : overview()));
        inLayout(<StockReports />);
        await screen.findAllByText("TZS 9,000");
        const tabs = screen.getAllByRole("tab");
        expect(tabs).toHaveLength(6);
        expect(tabs[0]).toHaveAttribute("aria-selected", "true");
        await userEvent.click(screen.getByRole("tab", { name: "stock.p8.rep.tab.low" }));
        expect(await screen.findByText("Oil")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "stock.p8.rep.tab.low" })).toHaveAttribute("aria-selected", "true");
    });

    it("shows a retry when a report fails", async () => {
        api.getReport.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(overview());
        inLayout(<StockReports />);
        await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
        expect((await screen.findAllByText("TZS 9,000")).length).toBeGreaterThan(0);
    });

    it("a plan without reports gets the upgrade panel and makes no request", async () => {
        inLayout(<StockReports />, { read_only: false, features: features({ stock_reports: false }) });
        expect(await screen.findByText("stock.p8.rep.lockedTitle")).toBeInTheDocument();
        expect(api.getReport).not.toHaveBeenCalled();
    });
});

describe("StockExpenses", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.listExpenses.mockResolvedValue({ items: [{ id: 1, category: "rent", amount: 150000, expense_date: "2026-10-20", note: "Oct", receipt_url: "https://res.cloudinary.com/x/r.jpg", status: "active" }], total: 1, total_amount: 150000, by_category: [] });
        api.createExpense.mockResolvedValue({ replayed: false, expense: { id: 2 } });
    });

    it("saves an expense with a request id and the receipt photo, then reloads", async () => {
        inLayout(<StockExpenses />);
        expect((await screen.findAllByText("TZS 150,000", { selector: "span.price" })).length).toBeGreaterThan(0);
        expect(screen.getByRole("link", { name: "stock.p8.exp.viewReceipt" })).toHaveAttribute("rel", "noopener noreferrer");
        await userEvent.type(screen.getByLabelText("stock.p8.exp.amount"), "3000");
        const photo = new File(["x"], "r.jpg", { type: "image/jpeg" });
        await userEvent.upload(screen.getByLabelText(/stock.p8.exp.receipt/), photo);
        fireEvent.submit(screen.getByRole("form", { name: "stock.p8.exp.new" }));
        await waitFor(() => expect(api.createExpense).toHaveBeenCalled());
        expect(api.createExpense).toHaveBeenCalledWith(expect.objectContaining({ category: "rent", amount: 3000, receipt: photo, idempotency_key: "req-p8-000001" }));
        await waitFor(() => expect(api.listExpenses).toHaveBeenCalledTimes(2));
    });

    it("refuses a zero amount, a non-image receipt and an over-size photo before sending", async () => {
        inLayout(<StockExpenses />);
        (await screen.findAllByText("TZS 150,000", { selector: "span.price" }));
        fireEvent.submit(screen.getByRole("form", { name: "stock.p8.exp.new" }));
        expect(await screen.findByText("stock.p8.exp.amountNeeded")).toBeInTheDocument();
        const input = screen.getByLabelText(/stock.p8.exp.receipt/);
        fireEvent.change(input, { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } });
        expect(await screen.findByText("stock.p8.exp.receiptType")).toBeInTheDocument();
        const big = new File(["x"], "b.jpg", { type: "image/jpeg" });
        Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
        fireEvent.change(input, { target: { files: [big] } });
        expect(await screen.findByText("stock.p8.exp.receiptSize")).toBeInTheDocument();
        expect(api.createExpense).not.toHaveBeenCalled();
    });

    it("cancelling asks first, then voids", async () => {
        api.voidExpense.mockResolvedValue({});
        inLayout(<StockExpenses />);
        await userEvent.click(await screen.findByRole("button", { name: "stock.p8.exp.cancel" }));
        expect(api.voidExpense).not.toHaveBeenCalled();
        const dialog = await screen.findByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: "stock.p8.exp.cancel" }));
        await waitFor(() => expect(api.voidExpense).toHaveBeenCalledWith(1, {}));
    });

    it("in read-only mode the form is disabled and there is no cancel button", async () => {
        inLayout(<StockExpenses />, { read_only: true, features: features() });
        (await screen.findAllByText("TZS 150,000", { selector: "span.price" }));
        expect(screen.getByLabelText("stock.p8.exp.amount")).toBeDisabled();
        expect(screen.getByRole("button", { name: "stock.p8.exp.save" })).toBeDisabled();
        expect(screen.queryByRole("button", { name: "stock.p8.exp.cancel" })).not.toBeInTheDocument();
    });
});

describe("StockImportExport", () => {
    const file = new File(["Name\nA"], "items.csv", { type: "text/csv" });
    const preview = { dry_run: true, summary: { create: 1, update: 1, error: 1 }, ignored_columns: ["Colour"], limit_warning: null, rows_truncated: false,
        rows: [{ row: 2, action: "create", data: { name: "A" }, errors: [], warnings: [] }, { row: 3, action: "update", data: { name: "B" }, errors: [], warnings: ["Stock isn't changed."] }, { row: 4, action: "error", data: {}, errors: [{ message: "Name is required for a new item." }], warnings: [] }] };
    beforeEach(() => {
        vi.clearAllMocks();
        api.importStockItems.mockImplementation(async (f, { dryRun }) => (dryRun ? preview : { dry_run: false, summary: { created: 1, updated: 1, skipped: 1, failed: 0 }, rows: [{ row: 4, status: "skipped", errors: [{ message: "Name is required for a new item." }] }] }));
    });
    const choose = (c) => fireEvent.change(c.getByLabelText(/stock.p8.io.file/), { target: { files: [file] } });

    it("previews first (nothing saved), shows per-row outcomes, then imports with one request id", async () => {
        const c = inLayout(<StockImportExport />);
        choose(screen);
        await userEvent.click(screen.getByRole("button", { name: "stock.p8.io.preview" }));
        expect(await screen.findByText('stock.p8.io.summary:{"create":1,"update":1,"error":1}')).toBeInTheDocument();
        expect(screen.getByText(/Name is required for a new item/)).toBeInTheDocument();
        expect(api.importStockItems).toHaveBeenCalledWith(file, { dryRun: true });
        await userEvent.click(screen.getByRole("button", { name: 'stock.p8.io.apply:{"count":2}' }));
        await waitFor(() => expect(api.importStockItems).toHaveBeenCalledWith(file, { dryRun: false, idempotencyKey: "req-p8-000001" }));
        expect(await screen.findByText(/Row 4|rowFailed/)).toBeInTheDocument();
        expect(toast.success).toHaveBeenCalled();
        expect(c).toBeDefined();
    });

    it("nothing to import when every row has a problem", async () => {
        api.importStockItems.mockResolvedValue({ ...preview, summary: { create: 0, update: 0, error: 3 } });
        inLayout(<StockImportExport />);
        choose(screen);
        await userEvent.click(screen.getByRole("button", { name: "stock.p8.io.preview" }));
        expect(await screen.findByRole("button", { name: 'stock.p8.io.apply:{"count":0}' })).toBeDisabled();
    });

    it("shows the server's reason when a file is rejected", async () => {
        api.importStockItems.mockRejectedValue(new Error("The first row must have column names."));
        inLayout(<StockImportExport />);
        choose(screen);
        await userEvent.click(screen.getByRole("button", { name: "stock.p8.io.preview" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("The first row must have column names.");
    });

    it("exports: ranged ones send the dates, valuation is off without cost reports, and they work in read-only mode", async () => {
        inLayout(<StockImportExport />, { read_only: true, features: features({ stock_cost_reports: false }) });
        expect(screen.getByText("stock.p8.io.readOnly")).toBeInTheDocument();
        expect(screen.queryByLabelText(/stock.p8.io.file/)).not.toBeInTheDocument(); // import switched off
        const rows = screen.getAllByRole("listitem");
        await userEvent.click(within(rows[0]).getByRole("button"));
        expect(api.downloadStockCsv).toHaveBeenCalledWith("sales", { from: expect.any(String), to: expect.any(String) });
        await userEvent.click(within(rows[3]).getByRole("button"));
        expect(api.downloadStockCsv).toHaveBeenLastCalledWith("items", undefined);
        expect(within(rows[4]).getByRole("button")).toBeDisabled();
    });
});

describe("StockLayout plan gate", () => {
    const renderLayout = () => render(
        <MemoryRouter initialEntries={["/seller/stock/reports"]}>
            <Routes><Route path="/seller/stock" element={<StockLayout />}><Route path="reports" element={<p>inside</p>} /></Route></Routes>
        </MemoryRouter>
    );
    beforeEach(async () => { vi.clearAllMocks(); await resetForTests(); api.listStockItems.mockResolvedValue({ summary: { items: 3 } }); });

    it("opens for a plan that includes Stock Management", async () => {
        api.getStockAccess.mockResolvedValue({ mode: "full", read_only: false, features: features() });
        renderLayout();
        expect(await screen.findByText("inside")).toBeInTheDocument();
    });

    it.each([["SUBSCRIPTION_REQUIRED", "trial.gate.posTitle"], ["FEATURE_NOT_IN_PLAN", "stock.p8.gate.notInPlanTitle"]])("%s shows the matching upgrade panel", async (code, title) => {
        api.getStockAccess.mockRejectedValue({ response: { status: 403, data: { code } }, message: "x" });
        renderLayout();
        expect(await screen.findByText(title)).toBeInTheDocument();
        expect(screen.queryByText("inside")).not.toBeInTheDocument();
    });

    it("after a plan ends it still opens, with a read-only banner and the days left", async () => {
        api.getStockAccess.mockResolvedValue({ mode: "read_only", read_only: true, grace_ends_in_days: 12, features: features() });
        renderLayout();
        expect(await screen.findByText("inside")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent('stock.p8.gate.readOnlyBody:{"days":12}');
    });

    it("warns softly when over the plan's item limit, and never blocks", async () => {
        api.getStockAccess.mockResolvedValue({ mode: "full", read_only: false, features: features({ stock_max_items: 2 }) });
        renderLayout();
        expect(await screen.findByText("inside")).toBeInTheDocument();
        expect(await screen.findByText(/stock.p8.gate.softLimit/)).toBeInTheDocument();
    });

    it("has tabs for the new screens", async () => {
        api.getStockAccess.mockResolvedValue({ mode: "full", read_only: false, features: features() });
        renderLayout();
        await screen.findByText("inside");
        ["stock.p8.tabExpenses", "stock.p8.tabReports", "stock.p8.tabImportExport"].forEach((k) => expect(screen.getByRole("link", { name: k })).toBeInTheDocument());
    });
});

describe("OfflineQueueBanner", () => {
    beforeEach(async () => { vi.clearAllMocks(); await resetForTests(); });
    const q = (key) => queueSale({ idempotency_key: key, lines: [{ item_id: 1, quantity: 1 }] }, { total: 2500, lines: [{ name: "Bag", quantity: 1 }] });

    it("renders nothing when nothing is waiting", async () => {
        const { container } = render(<OfflineQueueBanner />);
        await new Promise((r) => setTimeout(r, 20));
        expect(container).toBeEmptyDOMElement();
    });

    it("sends waiting sales when opened online, and clears itself", async () => {
        await q("key-banner-0001");
        api.syncOfflineSales.mockResolvedValue({ results: [{ key: "key-banner-0001", status: "created" }] });
        const { container } = render(<OfflineQueueBanner />);
        await waitFor(() => expect(api.syncOfflineSales).toHaveBeenCalled());
        await waitFor(() => expect(container).toBeEmptyDOMElement());
    });

    it("shows rejected sales with the reason and lets the seller discard them", async () => {
        await q("key-banner-0002");
        api.syncOfflineSales.mockResolvedValue({ results: [{ key: "key-banner-0002", status: "rejected", message: "Choose a customer for a credit sale." }] });
        render(<OfflineQueueBanner />);
        expect(await screen.findByText("Choose a customer for a credit sale.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "stock.p8.off.discard" }));
        await waitFor(() => expect(screen.queryByText("Choose a customer for a credit sale.")).not.toBeInTheDocument());
    });

    it("while offline it only shows the waiting count and doesn't try to send", async () => {
        const onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
        await q("key-banner-0003");
        render(<OfflineQueueBanner />);
        expect(await screen.findByText('stock.p8.off.waiting:{"count":1}')).toBeInTheDocument();
        expect(api.syncOfflineSales).not.toHaveBeenCalled();
        onLine.mockRestore();
    });
});
