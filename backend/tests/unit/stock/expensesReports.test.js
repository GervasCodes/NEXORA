jest.mock("../../../src/config/db", () => ({ query: jest.fn() }));
jest.mock("../../../src/modules/audit/audit.service", () => ({ log: jest.fn() }));
jest.mock("../../../src/utils/cloudinaryUpload", () => ({ uploadToCloudinary: jest.fn().mockResolvedValue({ secure_url: "https://res.cloudinary.com/x/r.jpg", public_id: "stock/receipts/r" }) }));
jest.mock("../../../src/utils/imageSanitize", () => ({ stripImageMetadata: jest.fn(async (b) => b) }));

const db = require("../../../src/config/db");
const audit = require("../../../src/modules/audit/audit.service");
const cloud = require("../../../src/utils/cloudinaryUpload");
const sanitize = require("../../../src/utils/imageSanitize");
const expenses = require("../../../src/modules/stock/expenses.service");
const reports = require("../../../src/modules/stock/reports.service");
const trade = require("../../../src/modules/stock/stock.trade");

describe("expenses.service", () => {
    beforeEach(() => { jest.clearAllMocks(); db.query.mockReset(); });
    const row = { id: 9, category: "rent", amount: 150000, expense_date: "2026-10-20", note: null, receipt_url: null, voided_at: null, created_at: new Date() };

    it("validates category, amount and date on the server", async () => {
        await expect(expenses.create(1, { category: "yacht", amount: 5 })).rejects.toThrow(/category/);
        await expect(expenses.create(1, { category: "rent", amount: 0 })).rejects.toThrow(/amount/);
        await expect(expenses.create(1, { category: "rent", amount: -5 })).rejects.toThrow();
        await expect(expenses.create(1, { category: "rent", amount: 5, expenseDate: "2999-01-01" })).rejects.toThrow(/future/);
        await expect(expenses.create(1, { category: "rent", amount: 5, expenseDate: "2001-01-01" })).rejects.toThrow(/far in the past/);
        await expect(expenses.create(1, { category: "rent", amount: 5, expenseDate: "20/10/2026" })).rejects.toThrow();
    });

    it("records an expense scoped to the seller, defaulting to today in Dar es Salaam, and audits it", async () => {
        db.query.mockResolvedValueOnce([{ insertId: 9 }]).mockResolvedValueOnce([[row]]);
        const out = await expenses.create(7, { category: "rent", amount: "150000.456" }, { createdBy: 7 });
        const insert = db.query.mock.calls[0];
        expect(insert[1][0]).toBe(7);
        expect(insert[1][2]).toBe(150000.46);
        expect(insert[1][3]).toBe(trade.today());
        expect(out.replayed).toBe(false);
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "stock.expense_created" }));
    });

    it("strips photo metadata before uploading a receipt, and stores only the URL", async () => {
        db.query.mockResolvedValueOnce([{ insertId: 9 }]).mockResolvedValueOnce([[{ ...row, receipt_url: "https://res.cloudinary.com/x/r.jpg" }]]);
        const buffer = Buffer.from("jpegbytes");
        const out = await expenses.create(1, { category: "transport", amount: 3000 }, { file: { buffer } });
        expect(sanitize.stripImageMetadata).toHaveBeenCalledWith(buffer);
        expect(cloud.uploadToCloudinary).toHaveBeenCalledWith(buffer, "stock/receipts");
        expect(out.expense.receipt_url).toMatch(/cloudinary/);
    });

    it("a repeated request id returns the first expense and uploads nothing", async () => {
        db.query.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[{ payload_hash: null }]]);
        const out = await expenses.create(1, { category: "rent", amount: 150000, idempotencyKey: "abcd-1234-efgh" }, { file: { buffer: Buffer.from("x") } });
        expect(out.replayed).toBe(true);
        expect(cloud.uploadToCloudinary).not.toHaveBeenCalled();
    });

    it("an expense of another seller is not found", async () => {
        db.query.mockResolvedValueOnce([[]]);
        await expect(expenses.get(1, 9)).rejects.toMatchObject({ statusCode: 404 });
        expect(db.query.mock.calls[0][1]).toEqual([9, 1]);
    });

    it("voiding keeps the record and logs who and why; voided expenses stay out of totals", async () => {
        db.query.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ ...row, voided_at: new Date() }]]);
        const out = await expenses.void(1, 9, { reason: "typo" });
        expect(out.status).toBe("voided");
        expect(db.query.mock.calls[1][0]).toMatch(/voided_at IS NULL/);
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "stock.expense_voided" }));

        db.query.mockReset();
        db.query.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[{ total: 1 }]]).mockResolvedValueOnce([[{ category: "rent", amount: 150000 }]]);
        db.query.mockResolvedValueOnce([[row]]);
        const list = await expenses.list(1, { from: "2026-10-01", to: "2026-10-31" }).catch((e) => e);
        // the totals query always excludes voided expenses
        expect(db.query.mock.calls.some((c) => /voided_at IS NULL GROUP BY category/.test(c[0]))).toBe(true);
        expect(list.total_amount).toBe(150000);
    });
});

describe("reports.service", () => {
    beforeEach(() => { jest.clearAllMocks(); db.query.mockReset(); });
    const cost = { features: { stock_cost_reports: true } };
    const noCost = { features: { stock_cost_reports: false } };

    // overview runs: onTotals, offTotals(sales), offTotals(lines), onDaily, offDaily, expenses  (Promise.all order)
    const script = () => {
        db.query.mockImplementation(async (sql) => {
            if (/FROM order_items oi/.test(sql) && /COUNT\(DISTINCT/.test(sql)) return [[{ orders: 2, units: 3, gross: 10000, net: 9000, cost: 4000, cost_missing_units: 1 }]];
            if (/FROM order_items oi/.test(sql)) return [[{ day: "2026-10-27", net: 9000 }]];
            if (/FROM sale_lines/.test(sql)) return [[{ units: 4, cost: 3000, cost_missing_units: 0 }]];
            if (/FROM sales s/.test(sql) && /COUNT\(\*\)/.test(sql)) return [[{ sales: 3, revenue: 8000, discounts: 500 }]];
            if (/FROM sales s/.test(sql)) return [[{ day: "2026-10-28", revenue: 8000 }]];
            if (/FROM stock_expenses/.test(sql)) return [[{ amount: 2000 }]];
            throw new Error(`unscripted: ${sql.slice(0, 80)}`);
        });
    };

    it("keeps on-platform (net of commission/refunds) and off-platform revenue apart, never mixing them", async () => {
        script();
        const o = await reports.overview(1, { from: "2026-10-27", to: "2026-10-28" }, cost);
        expect(o.on_platform).toMatchObject({ orders: 2, gross: 10000, net_revenue: 9000, commission_and_refunds: 1000 });
        expect(o.off_platform).toMatchObject({ sales: 3, net_revenue: 8000 });
        expect(o.combined.net_revenue).toBe(17000);
        expect(o.daily).toEqual([{ day: "2026-10-27", on_platform: 9000, off_platform: 0 }, { day: "2026-10-28", on_platform: 0, off_platform: 8000 }]);
    });

    it("on-platform money comes from wallet-credited, non-reversed, non-cancelled lines, scoped to the seller and Dar bounds", async () => {
        script();
        await reports.overview(5, { from: "2026-10-28", to: "2026-10-28" }, cost);
        const onCall = db.query.mock.calls.find((c) => /COUNT\(DISTINCT/.test(c[0]));
        expect(onCall[0]).toMatch(/wallet_credited = 1/);
        expect(onCall[0]).toMatch(/chargeback_reversed_at IS NULL/);
        expect(onCall[0]).toMatch(/status <> 'cancelled'/);
        expect(onCall[0]).toMatch(/seller_net_amount/);
        expect(onCall[1][0]).toBe(5);
        expect(onCall[1][1].toISOString()).toBe("2026-10-27T21:00:00.000Z");
        expect(onCall[1][2].toISOString()).toBe("2026-10-28T21:00:00.000Z");
    });

    it("off-platform revenue excludes voided sales and subtracts returns", async () => {
        script();
        await reports.overview(1, {}, cost);
        const offCall = db.query.mock.calls.find((c) => /FROM sales s/.test(c[0]) && /COUNT\(\*\)/.test(c[0]));
        expect(offCall[0]).toMatch(/voided_at IS NULL/);
        expect(offCall[0]).toMatch(/total_amount - s\.returned_amount/);
    });

    it("profit = revenue - cost of goods - expenses, and says how many units had no cost recorded", async () => {
        script();
        const o = await reports.overview(1, { from: "2026-10-27", to: "2026-10-28" }, cost);
        expect(o.profit).toMatchObject({ revenue: 17000, cost_of_goods: 7000, gross_profit: 10000, expenses: 2000, net_profit: 8000, cost_missing_units: 1 });
        expect(o.cost_locked).toBe(false);
    });

    it("without the cost-reports feature the overview carries no cost or profit figure at all", async () => {
        script();
        const o = await reports.overview(1, { from: "2026-10-27", to: "2026-10-28" }, noCost);
        expect(o.profit).toBeNull();
        expect(o.cost_locked).toBe(true);
        expect(JSON.stringify(o)).not.toMatch(/cost_of_goods|gross_profit|"cost"/);
    });

    it("valuation is refused without the cost feature (403 FEATURE_NOT_IN_PLAN), and sums stock x cost with it", async () => {
        await expect(reports.valuation(1, {}, noCost)).rejects.toMatchObject({ statusCode: 403, code: "FEATURE_NOT_IN_PLAN" });
        db.query.mockResolvedValueOnce([[
            { id: 1, name: "A", unit: "pcs", cost_price: 100, sell_price: 150, stock: 10 },
            { id: 2, name: "B", unit: "pcs", cost_price: null, sell_price: 50, stock: 4 },
            { id: 3, name: "C", unit: "pcs", cost_price: 20, sell_price: 30, stock: -2 }
        ]]);
        const v = await reports.valuation(1, {}, cost);
        expect(v).toMatchObject({ total_at_cost: 1000, total_at_retail: 1700, items_without_cost: 1, item_count: 3 });
    });

    it("best sellers hide cost and profit columns without the feature, and rank by units or revenue", async () => {
        db.query
            .mockResolvedValueOnce([[{ item_id: 1, name: "Sugar", units: 5, revenue: 15000, cost: 12000 }, { item_id: 2, name: "Oil", units: 2, revenue: 40000, cost: 30000 }]])
            .mockResolvedValueOnce([[{ item_id: 1, name: "Sugar", units: 3, revenue: 8000, cost: 7000 }]]);
        const r = await reports.bestSellers(1, { by: "units", from: "2026-10-01", to: "2026-10-31" }, noCost);
        expect(r.items.map((i) => i.name)).toEqual(["Sugar", "Oil"]);
        expect(r.items[0]).toMatchObject({ units: 8, revenue: 23000, on_platform_units: 3, off_platform_units: 5 });
        expect(r.items[0].cost).toBeUndefined();
        expect(r.items[0].profit).toBeUndefined();

        db.query.mockReset();
        db.query.mockResolvedValueOnce([[{ item_id: 1, name: "Sugar", units: 5, revenue: 15000, cost: 12000 }, { item_id: 2, name: "Oil", units: 2, revenue: 40000, cost: 30000 }]]).mockResolvedValueOnce([[]]);
        const byRev = await reports.bestSellers(1, { by: "revenue" }, cost);
        expect(byRev.items.map((i) => i.name)).toEqual(["Oil", "Sugar"]);
        expect(byRev.items[0].profit).toBe(10000);
    });

    it("daily close totals money in/out by method and takes expenses off the net", async () => {
        db.query.mockImplementation(async (sql) => {
            if (/FROM sales s/.test(sql)) return [[{ sales: 4, net_sales: 20000, discounts: 0, credit_given: 5000 }]];
            if (/voided_at >= \?/.test(sql)) return [[{ n: 1 }]];
            if (/FROM stock_payments/.test(sql)) return [[
                { direction: "in", kind: "sale", method: "cash", amount: 12000 },
                { direction: "in", kind: "sale", method: "mobile_money", amount: 3000 },
                { direction: "in", kind: "debt_payment", method: "cash", amount: 2000 },
                { direction: "out", kind: "refund", method: "cash", amount: 1000 },
                { direction: "out", kind: "purchase_payment", method: "cash", amount: 4000 }
            ]];
            if (/FROM stock_expenses/.test(sql)) return [[{ amount: 1500 }]];
            if (/FROM purchases/.test(sql)) return [[{ n: 1, total: 6000 }]];
            if (/FROM order_items oi/.test(sql)) return [[{ orders: 1, units: 1, gross: 100, net: 90, cost: 0, cost_missing_units: 0 }]];
            throw new Error(sql.slice(0, 60));
        });
        const d = await reports.dailyClose(1, { date: "2026-10-28" });
        expect(d.money).toMatchObject({ in: 17000, out: 5000, debts_collected: 2000, supplier_payments: 4000, refunds: 1000 });
        expect(d.money.by_method.cash).toEqual({ in: 14000, out: 5000, net: 9000 });
        expect(d.net_money).toBe(10500);
        expect(d.credit_given).toBe(5000);
        expect(d.on_platform.net_revenue).toBe(90);
        const stockPayments = db.query.mock.calls.find((c) => /FROM stock_payments/.test(c[0]));
        expect(stockPayments[1][1].toISOString()).toBe("2026-10-27T21:00:00.000Z");
    });

    it("debts: owed per customer and supplier with ageing buckets", async () => {
        const old = new Date(Date.now() - 70 * 86400000); const recent = new Date(Date.now() - 5 * 86400000);
        db.query
            .mockResolvedValueOnce([[{ id: 1, name: "Asha", phone: null, open_sales: 2, owed: 9000, oldest_at: old }, { id: 2, name: "Juma", phone: "0712", open_sales: 1, owed: 1000, oldest_at: recent }]])
            .mockResolvedValueOnce([[{ id: 3, name: "Bakhresa", phone: null, open_purchases: 1, owed: 50000, oldest_at: recent }]]);
        const d = await reports.debts(1);
        expect(d.customers.total_owed).toBe(10000);
        expect(d.customers.ageing).toEqual({ "0_30": 1000, "31_60": 0, "61_plus": 9000 });
        expect(d.suppliers.total_owed).toBe(50000);
    });

    it("low stock lists out-of-stock first and counts both kinds", async () => {
        db.query.mockResolvedValueOnce([[{ id: 1, name: "Oil", unit: "pcs", stock: 0, reorder_level: 5 }, { id: 2, name: "Salt", unit: "pcs", stock: 3, reorder_level: 5 }]]);
        const r = await reports.lowStock(1);
        expect(r).toMatchObject({ out_count: 1, low_count: 1 });
        expect(r.items[0].status).toBe("out");
        expect(db.query.mock.calls[0][0]).toMatch(/reorder_level > 0/);
    });
});
