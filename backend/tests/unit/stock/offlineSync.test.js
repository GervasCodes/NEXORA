jest.mock("../../../src/config/db", () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock("../../../src/modules/stock/stock.ledger", () => {
    const actual = jest.requireActual("../../../src/modules/stock/stock.ledger");
    return { ...actual, withTransaction: jest.fn(), lockByItem: jest.fn(), applyDelta: jest.fn() };
});
jest.mock("../../../src/modules/stock/stock.service", () => ({ syncListingItems: jest.fn().mockResolvedValue(0) }));
jest.mock("../../../src/modules/settings/settings.service", () => ({ getStockBackdateMaxDays: jest.fn().mockResolvedValue(7) }));
jest.mock("../../../src/modules/audit/audit.service", () => ({ log: jest.fn() }));
jest.mock("../../../src/modules/stock/stock.alerts", () => ({ notifyNegativeStock: jest.fn() }));

const ledger = require("../../../src/modules/stock/stock.ledger");
const audit = require("../../../src/modules/audit/audit.service");
const alerts = require("../../../src/modules/stock/stock.alerts");
const sales = require("../../../src/modules/stock/sales.service");
const { fakeConn } = require("../../helpers/fakeConn");

const target = (id, stock, over = {}) => ({
    kind: "item", product: null, variant: null, stock,
    item: { id, seller_id: 1, source: "external", product_id: null, name: `Item ${id}`, sell_price: 1000, cost_price: 600, is_archived: 0, ...over }
});
const rules = () => [
    [/FROM sales WHERE seller_id = \? AND idempotency_key/, [[]]],
    [/INSERT INTO stock_counters/, [{}]],
    [/SELECT LAST_INSERT_ID/, [[{ n: 7 }]]],
    [/INSERT INTO sales/, [{ insertId: 100 }]],
    [/INSERT INTO sale_lines/, [{}]],
    [/UPDATE sales SET stock_flagged/, [{}]],
    [/INSERT INTO stock_payments/, [{ insertId: 1 }]]
];
const run = (conn) => ledger.withTransaction.mockImplementation(async (work) => work(conn));
const sale = (key, over = {}) => ({ idempotencyKey: key, lines: [{ itemId: 2, quantity: 3 }], paymentMethod: "cash", ...over });

describe("offline sales sync", () => {
    let getSale;
    beforeEach(() => {
        jest.clearAllMocks();
        getSale = jest.spyOn(sales, "getSale").mockResolvedValue({ id: 100, receipt_no: "R000007", stock_flagged: false });
    });
    afterEach(() => getSale.mockRestore());

    it("applies a completed sale even when stock is short: negative stock allowed, sale flagged, seller alerted", async () => {
        const conn = fakeConn(rules()); run(conn);
        ledger.lockByItem.mockResolvedValue(target(2, 1));
        ledger.applyDelta.mockResolvedValue({ stockBefore: 1, stockAfter: -2 });

        const [r] = await sales.syncOffline(1, [sale("uuid-0001-aaaa")]);
        expect(r.status).toBe("created");
        expect(ledger.applyDelta.mock.calls[0][3]).toMatchObject({ allowNegative: true, type: "sale" });
        expect(conn.writes(/UPDATE sales SET stock_flagged = 1/)).toHaveLength(1);
        expect(alerts.notifyNegativeStock).toHaveBeenCalledWith(1, "R000007", ["Item 2"]);
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "stock.offline_sale_negative_stock" }));
        // recorded as an offline sale, with the till's own sale time
        expect(conn.writes(/INSERT INTO sales/)[0].sql).toMatch(/is_offline/);
    });

    it("does not flag or alert when stock was enough", async () => {
        const conn = fakeConn(rules()); run(conn);
        ledger.lockByItem.mockResolvedValue(target(2, 10));
        ledger.applyDelta.mockResolvedValue({ stockBefore: 10, stockAfter: 7 });
        await sales.syncOffline(1, [sale("uuid-0002-aaaa")]);
        expect(conn.writes(/UPDATE sales SET stock_flagged/)).toHaveLength(0);
        expect(alerts.notifyNegativeStock).not.toHaveBeenCalled();
    });

    it("accepts archived items and sales far older than the normal back-date window", async () => {
        const conn = fakeConn(rules()); run(conn);
        ledger.lockByItem.mockResolvedValue(target(2, 5, { is_archived: 1 }));
        ledger.applyDelta.mockResolvedValue({ stockBefore: 5, stockAfter: 2 });
        const old = new Date(Date.now() - 20 * 86400000).toISOString();
        const [r] = await sales.syncOffline(1, [sale("uuid-0003-aaaa", { soldAt: old })]);
        expect(r.status).toBe("created");
        const insert = conn.writes(/INSERT INTO sales/)[0].params;
        expect(insert.some((p) => p instanceof Date && p.toISOString() === old)).toBe(true);
    });

    it("a nonsense or future sale time becomes 'now' instead of rejecting the sale", async () => {
        const conn = fakeConn(rules()); run(conn);
        ledger.lockByItem.mockResolvedValue(target(2, 5));
        ledger.applyDelta.mockResolvedValue({ stockBefore: 5, stockAfter: 2 });
        const out = await sales.syncOffline(1, [
            sale("uuid-0004-aaaa", { soldAt: "not a date" }),
            sale("uuid-0005-aaaa", { soldAt: new Date(Date.now() + 3 * 86400000).toISOString() })
        ]);
        expect(out.map((r) => r.status)).toEqual(["created", "created"]);
    });

    it("sending the same sale again replays it instead of recording it twice", async () => {
        const conn = fakeConn([[/FROM sales WHERE seller_id = \? AND idempotency_key/, [[{ id: 100, payload_hash: null }]]], ...rules()]);
        run(conn);
        const [r] = await sales.syncOffline(1, [sale("uuid-0006-aaaa")]);
        expect(r).toMatchObject({ status: "replayed", sale_id: 100 });
        expect(ledger.applyDelta).not.toHaveBeenCalled();
        expect(conn.writes(/INSERT INTO sales/)).toHaveLength(0);
    });

    it("one bad sale doesn't stop the others, and is reported with its reason", async () => {
        const conn = fakeConn(rules()); run(conn);
        ledger.lockByItem.mockResolvedValue(target(2, 5));
        ledger.applyDelta.mockResolvedValue({ stockBefore: 5, stockAfter: 2 });
        const out = await sales.syncOffline(1, [
            sale("uuid-0007-aaaa", { lines: [] }),
            { lines: [{ itemId: 2, quantity: 1 }] },
            sale("uuid-0008-aaaa")
        ]);
        expect(out.map((r) => r.status)).toEqual(["rejected", "rejected", "created"]);
        expect(out[1].message).toMatch(/request id/);
    });

    it("limits batch size and refuses an empty batch", async () => {
        await expect(sales.syncOffline(1, [])).rejects.toThrow(/Nothing to sync/);
        await expect(sales.syncOffline(1, Array.from({ length: 51 }, (v, i) => sale(`uuid-${i}-aaaaaaa`)))).rejects.toThrow(/at most 50/);
    });

    it("an ordinary (online) sale still refuses to take stock below zero", async () => {
        const conn = fakeConn(rules()); run(conn);
        ledger.lockByItem.mockResolvedValue(target(2, 1));
        ledger.applyDelta.mockResolvedValue({ stockBefore: 1, stockAfter: 0 });
        await sales.createSale(1, sale("uuid-0009-aaaa"));
        expect(ledger.applyDelta.mock.calls[0][3].allowNegative).toBe(false);
    });
});
