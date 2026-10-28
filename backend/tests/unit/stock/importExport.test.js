jest.mock("../../../src/config/db", () => ({ query: jest.fn() }));
jest.mock("../../../src/modules/stock/stock.service", () => ({ createItem: jest.fn(), updateItem: jest.fn(), getItem: jest.fn() }));
jest.mock("../../../src/modules/audit/audit.service", () => ({ log: jest.fn() }));

const db = require("../../../src/config/db");
const stockService = require("../../../src/modules/stock/stock.service");
const audit = require("../../../src/modules/audit/audit.service");
const io = require("../../../src/modules/stock/importExport.service");

const csv = (text) => ({ originalname: "items.csv", buffer: Buffer.from(text), mimetype: "text/csv" });
const existing = [
    { id: 1, source: "external", product_id: null, name: "Sugar 1kg", sku: "SUG-1", barcode: "6001", unit: "pcs", cost_price: 2400, sell_price: 3000, reorder_level: 5, is_archived: 0 },
    { id: 2, source: "nexora", product_id: 9, name: "Rice", sku: null, barcode: "6002", unit: "pcs", cost_price: null, sell_price: 4000, reorder_level: 5, is_archived: 0 }
];
const HEAD = "Name,SKU,Barcode,Unit,Cost price,Selling price,Reorder level,Opening stock\n";

describe("importExport.service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.query.mockResolvedValue([existing]);
        stockService.createItem.mockImplementation(async (s, d) => ({ id: 50 }));
        stockService.updateItem.mockResolvedValue({});
        stockService.getItem.mockImplementation(async (s, id) => existing.find((e) => e.id === id));
    });

    it("provides a template in English and Swahili", () => {
        const en = io.template("en"); const sw = io.template("sw");
        expect(en.csv).toContain("Selling price"); expect(sw.csv).toContain("Bei ya kuuza");
        expect(en.filename).toMatch(/\.csv$/);
    });

    describe("numbers", () => {
        it.each([["1,500", 1500], ["TSh 2 400", 2400], ["2400.50", 2400.5], ["2,5", 2.5], ["", null], ["12abc", NaN], ["-4", NaN]])("%s -> %s", (raw, want) => {
            const got = io.toNumber(raw);
            if (Number.isNaN(want)) expect(got).toBeNaN(); else expect(got).toBe(want);
        });
    });

    describe("dry run", () => {
        it("plans create / update / error per row without writing anything", async () => {
            const out = await io.previewItems(1, csv(`${HEAD}Maziwa,MZ-1,7001,pcs,900,1200,3,20\nSugar 1kg,SUG-1,,,2500,3100,,\n,,,,,,,\nBad,,,,abc,,,\n`));
            expect(out.dry_run).toBe(true);
            expect(out.summary).toEqual({ create: 1, update: 1, error: 1 });
            // the blank spreadsheet row 4 is skipped, but "Bad" is still reported as row 5
            expect(out.rows.map((r) => [r.row, r.action])).toEqual([[2, "create"], [3, "update"], [5, "error"]]);
            expect(out.rows[2].errors[0].field).toBe("cost_price");
            expect(stockService.createItem).not.toHaveBeenCalled();
            expect(stockService.updateItem).not.toHaveBeenCalled();
        });

        it("understands Swahili column names", async () => {
            const out = await io.previewItems(1, csv("Jina,Bei ya kuuza,Stoku ya kuanzia\nUnga,1800,40\n"));
            expect(out.summary.create).toBe(1);
            expect(out.rows[0].data).toEqual({ name: "Unga", sell_price: 1800, opening_stock: 40 });
        });

        it("needs a Name column, and tells the seller where to get the template", async () => {
            await expect(io.previewItems(1, csv("Price\n100\n"))).rejects.toThrow(/Name/);
        });

        it("flags a duplicate barcode inside the file, and a barcode that already exists matches that item", async () => {
            const out = await io.previewItems(1, csv(`${HEAD}A,,9001,,,,,\nB,,9001,,,,,\nC,,6001,,,,,\n`));
            expect(out.rows[1].errors[0].message).toMatch(/row 2/);
            expect(out.rows[2]).toMatchObject({ action: "update", match_id: 1, matched_by: "barcode" });
        });

        it("warns - not errors - that an import never changes the stock of an existing item", async () => {
            const out = await io.previewItems(1, csv(`${HEAD}Sugar 1kg,SUG-1,,,,,,500\n`));
            expect(out.rows[0].action).toBe("update");
            expect(out.rows[0].warnings.join(" ")).toMatch(/stock count/);
        });

        it("warns when the new items would pass the plan's soft limit, without blocking", async () => {
            const out = await io.previewItems(1, csv(`${HEAD}New one,,,,,,,\n`), { features: { stock_max_items: 2 } });
            expect(out.limit_warning).toMatchObject({ max_items: 2, would_have: 3 });
            expect(out.summary.create).toBe(1);
        });

        it("refuses too many rows", async () => {
            const rows = Array.from({ length: 2001 }, (v, i) => `Item ${i}`).join("\n");
            await expect(io.previewItems(1, csv(`Name\n${rows}`))).rejects.toThrow(/at most 2000/);
        });
    });

    describe("apply", () => {
        it("creates new items with their opening stock, updates matches, and skips bad rows", async () => {
            const out = await io.applyItems(1, csv(`${HEAD}Maziwa,MZ-1,7001,pcs,900,1200,3,20\nSugar 1kg,SUG-1,,,2500,3100,,\nBad,,,,abc,,,\n`), { idempotencyKey: "batch-1", createdBy: 1 });
            expect(out.summary).toEqual({ created: 1, updated: 1, skipped: 1, failed: 0 });
            expect(stockService.createItem).toHaveBeenCalledWith(1, expect.objectContaining({ name: "Maziwa", costPrice: 900, sellPrice: 1200, openingStock: 20, idempotencyKey: expect.stringMatching(/^imp[0-9a-f]{12}r2$/) }), { createdBy: 1 });
            expect(stockService.updateItem).toHaveBeenCalledWith(1, 1, expect.objectContaining({ costPrice: 2500, sellPrice: 3100 }));
            expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "stock.import_applied" }));
        });

        it("never writes stock for an existing item and never changes a listed item's name or price", async () => {
            await io.applyItems(1, csv(`${HEAD}Rice renamed,,6002,,500,9999,8,77\n`));
            const patch = stockService.updateItem.mock.calls[0][2];
            expect(patch).toEqual({ barcode: "6002", costPrice: 500, reorderLevel: 8 });
            expect(stockService.createItem).not.toHaveBeenCalled();
        });

        it("a row that fails is reported and the rest still go through", async () => {
            stockService.createItem.mockRejectedValueOnce(new Error("Another item already uses this barcode.")).mockResolvedValueOnce({ id: 51 });
            const out = await io.applyItems(1, csv(`${HEAD}A,,9001,,,,,\nB,,9002,,,,,\n`));
            expect(out.summary).toMatchObject({ created: 1, failed: 1 });
            expect(out.rows[0].errors[0].message).toMatch(/barcode/);
        });

        it("uses the same request id for the same batch, so a retry can't double the opening stock", async () => {
            await io.applyItems(1, csv(`${HEAD}A,,,,,,,5\n`), { idempotencyKey: "same" });
            await io.applyItems(1, csv(`${HEAD}A,,,,,,,5\n`), { idempotencyKey: "same" });
            const keys = stockService.createItem.mock.calls.map((c) => c[1].idempotencyKey);
            expect(keys[0]).toBe(keys[1]);
        });
    });

    describe("export", () => {
        it("sales export: Dar es Salaam dates, status, balance owed, formula-safe text", async () => {
            db.query.mockResolvedValueOnce([[{
                receipt_no: "R000001", sold_at: "2026-10-27T21:30:00Z", customer_name: "=cmd|' /C calc'!A0", payment_method: "credit",
                voided_at: null, subtotal: 5000, discount_amount: 0, total_amount: 5000, returned_amount: 1000, paid_amount: 1000,
                is_offline: 1, stock_flagged: 0, note: null
            }]]);
            const out = await io.exportCsv(1, "sales", { from: "2026-10-01", to: "2026-10-31" }, { features: {} });
            expect(out.filename).toBe("nexora-sales-2026-10-01_2026-10-31.csv");
            expect(out.csv).toContain("2026-10-28 00:30");
            expect(out.csv).toContain("'=cmd");
            expect(out.csv).toMatch(/,4000,1000,3000,yes,/); // net, paid, balance owed, offline
            expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "stock.export_downloaded" }));
        });

        it("hides cost columns without the cost-reports feature, and refuses the valuation export", async () => {
            db.query.mockResolvedValueOnce([[{ name: "Sugar", sku: null, barcode: null, unit: "pcs", cost_price: 2400, sell_price: 3000, reorder_level: 5, stock: 10 }]]);
            const items = await io.exportCsv(1, "items", {}, { features: { stock_cost_reports: false } });
            expect(items.csv).not.toContain("2400");
            await expect(io.exportCsv(1, "valuation", {}, { features: {} })).rejects.toMatchObject({ code: "FEATURE_NOT_IN_PLAN", statusCode: 403 });
        });

        it("rejects an unknown export and an over-long range", async () => {
            await expect(io.exportCsv(1, "passwords", {}, {})).rejects.toThrow(/Unknown/);
            await expect(io.exportCsv(1, "sales", { from: "2020-01-01", to: "2026-01-01" }, {})).rejects.toThrow(/one year/);
        });
    });
});
