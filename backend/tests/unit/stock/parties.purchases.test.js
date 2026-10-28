jest.mock("../../../src/config/db", () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock("../../../src/modules/stock/stock.ledger", () => {
    const actual = jest.requireActual("../../../src/modules/stock/stock.ledger");
    return { ...actual, withTransaction: jest.fn(), lockByItem: jest.fn(), applyDelta: jest.fn() };
});
jest.mock("../../../src/modules/stock/stock.service", () => ({ syncListingItems: jest.fn() }));
jest.mock("../../../src/modules/settings/settings.service", () => ({ getStockBackdateMaxDays: jest.fn().mockResolvedValue(7) }));
jest.mock("../../../src/modules/audit/audit.service", () => ({ log: jest.fn() }));
jest.mock("../../../src/modules/productAlert/productAlert.service", () => ({ checkAndNotifyStockChange: jest.fn().mockResolvedValue(undefined) }));

const db = require("../../../src/config/db");
const ledger = require("../../../src/modules/stock/stock.ledger");
const audit = require("../../../src/modules/audit/audit.service");
const alerts = require("../../../src/modules/productAlert/productAlert.service");
const parties = require("../../../src/modules/stock/parties.service");
const purchases = require("../../../src/modules/stock/purchases.service");
const { fakeConn } = require("../../helpers/fakeConn");

const run = (conn) => ledger.withTransaction.mockImplementation(async (work) => work(conn));

describe("parties.service - customer payments", () => {
    let statement;
    beforeEach(() => {
        jest.clearAllMocks();
        statement = jest.spyOn(parties, "customerStatement").mockResolvedValue({ customer: { id: 5 } });
    });
    afterEach(() => statement.mockRestore());

    const open = (...balances) => balances.map(([id, total, paid], i) => ({ id, total_amount: total, returned_amount: 0, paid_amount: paid }));
    const rules = (sales, existing = []) => [
        [/FROM stock_customers WHERE id = \? AND seller_id = \? FOR UPDATE/, [[{ id: 5 }]]],
        [/FROM stock_payments WHERE seller_id = \? AND batch_key/, [existing]],
        [/FROM sales\s+WHERE seller_id = \? AND customer_id = \? AND voided_at IS NULL/, [sales]],
        [/UPDATE sales SET paid_amount = paid_amount \+ \?/, [{}]],
        [/INSERT INTO stock_payments/, [{ insertId: 1 }]]
    ];

    it("pays the oldest debts first and spreads one payment over several sales", async () => {
        const conn = fakeConn(rules(open([1, 5000, 4000], [2, 8000, 0], [3, 3000, 0])));
        run(conn);
        await parties.receiveCustomerPayment(1, 5, { amount: 4000, method: "mobile_money" }, { createdBy: 9 });

        const updates = conn.writes(/UPDATE sales SET paid_amount/).map((c) => c.params);
        expect(updates).toEqual([[1000, 1], [3000, 2]]); // 1 000 clears sale 1, 3 000 goes to sale 2
        const pays = conn.writes(/INSERT INTO stock_payments/).map((c) => c.params.slice(0, 7));
        expect(pays[0]).toEqual([1, "in", 1000, "mobile_money", 1, 5, null]);
        expect(pays[1]).toEqual([1, "in", 3000, "mobile_money", 2, 5, null]);
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "stock.debt_payment_received" }));
    });

    it("refuses more than is owed, and a customer who owes nothing", async () => {
        run(fakeConn(rules(open([1, 5000, 4000]))));
        await expect(parties.receiveCustomerPayment(1, 5, { amount: 2000 })).rejects.toMatchObject({ statusCode: 409 });
        run(fakeConn(rules([])));
        await expect(parties.receiveCustomerPayment(1, 5, { amount: 100 })).rejects.toThrow(/doesn't owe/);
        await expect(parties.receiveCustomerPayment(1, 5, { amount: 0 })).rejects.toThrow(/amount/i);
    });

    it("replays a repeated request id and refuses the same id for a different amount", async () => {
        const hash = require("../../../src/modules/stock/stock.ledger").hashPayload({ kind: "debt", customerId: 5, amount: 1000, method: "cash", note: null });
        const conn = fakeConn(rules(open([1, 5000, 0]), [{ payload_hash: hash }]));
        run(conn);
        const out = await parties.receiveCustomerPayment(1, 5, { amount: 1000, idempotencyKey: "abcdefgh12" });
        expect(out.replayed).toBe(true);
        expect(conn.writes(/UPDATE sales/)).toHaveLength(0);

        run(fakeConn(rules(open([1, 5000, 0]), [{ payload_hash: hash }])));
        await expect(parties.receiveCustomerPayment(1, 5, { amount: 2000, idempotencyKey: "abcdefgh12" })).rejects.toMatchObject({ statusCode: 409 });
    });

    it("404s for a customer that isn't this seller's", async () => {
        run(fakeConn([[/FOR UPDATE/, [[]]]]));
        await expect(parties.receiveCustomerPayment(1, 5, { amount: 100 })).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe("parties.service - customers and suppliers", () => {
    beforeEach(() => jest.clearAllMocks());

    it("needs a name and turns a duplicate phone into a clear 409", async () => {
        await expect(parties.create("customer", 1, { name: "  " })).rejects.toThrow(/name is required/i);
        db.query.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" }));
        await expect(parties.create("supplier", 1, { name: "Mama Neema", phone: "0712" })).rejects.toMatchObject({ statusCode: 409 });
    });

    it("every read and write is scoped to the seller", async () => {
        db.query.mockResolvedValue([[{ id: 5, name: "A", owed: 0 }]]);
        await parties.get("customer", 7, 5);
        expect(db.query.mock.calls[0][1]).toEqual([5, 7]);
        db.query.mockResolvedValue([[]]);
        await expect(parties.get("supplier", 7, 99)).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe("purchases.service", () => {
    beforeEach(() => jest.clearAllMocks());

    describe("weightedAverageCost", () => {
        it("blends the cost on hand with the new purchase", () => {
            expect(purchases.weightedAverageCost(10, 100, 10, 200)).toBe(150);
            expect(purchases.weightedAverageCost(3, 1000, 1, 2000)).toBe(1250);
            expect(purchases.weightedAverageCost(10, 100, 5, 130)).toBe(110);
        });
        it("uses the new unit cost when nothing is on hand, stock is negative or there is no cost yet", () => {
            expect(purchases.weightedAverageCost(0, 100, 5, 130)).toBe(130);
            expect(purchases.weightedAverageCost(-4, 100, 5, 130)).toBe(130);
            expect(purchases.weightedAverageCost(10, null, 5, 130)).toBe(130);
        });
    });

    describe("createPurchase", () => {
        const item = (id, stock, cost, over = {}) => ({
            kind: "item", product: null, variant: null, stock,
            item: { id, seller_id: 1, source: "external", product_id: null, name: `Item ${id}`, cost_price: cost, is_archived: 0 }, ...over
        });
        const rules = (overrides = []) => [
            ...overrides,
            [/FROM purchases WHERE seller_id = \? AND idempotency_key/, [[]]],
            [/FROM stock_suppliers WHERE id/, [[{ id: 3, name: "Mama Neema" }]]],
            [/INSERT INTO stock_counters/, [{}]],
            [/SELECT LAST_INSERT_ID/, [[{ n: 4 }]]],
            [/INSERT INTO purchases/, [{ insertId: 50 }]],
            [/INSERT INTO purchase_lines/, [{}]],
            [/UPDATE stock_items SET cost_price/, [{}]],
            [/INSERT INTO stock_payments/, [{ insertId: 1 }]]
        ];
        let get;
        beforeEach(() => {
            ledger.applyDelta.mockResolvedValue({});
            get = jest.spyOn(purchases, "getPurchase").mockResolvedValue({ id: 50 });
        });
        afterEach(() => get.mockRestore());

        it("receives the goods, moves the cost to the weighted average and records the payment", async () => {
            const t = item(2, 10, 100);
            ledger.lockByItem.mockResolvedValue(t);
            const conn = fakeConn(rules());
            run(conn);
            await purchases.createPurchase(1, { lines: [{ itemId: 2, quantity: 10, unitCost: 200 }], supplierId: 3, invoiceNo: "INV-9" });

            expect(ledger.applyDelta).toHaveBeenCalledWith(conn, t, 10, expect.objectContaining({ type: "purchase", refType: "purchase", refId: 50, unitCost: 200 }));
            expect(conn.writes(/UPDATE stock_items SET cost_price/)[0].params).toEqual([150, 2, 1]);
            const insert = conn.writes(/INSERT INTO purchases/)[0].params;
            expect(insert).toEqual(expect.arrayContaining(["P000004", "Mama Neema", "INV-9", 2000]));
            // not stated -> paid in full
            expect(conn.writes(/INSERT INTO stock_payments/)[0].params.slice(0, 4)).toEqual([1, "out", 2000, "cash"]);
        });

        it("keeps an unpaid part as a debt to the supplier and takes no payment row for nothing paid", async () => {
            ledger.lockByItem.mockResolvedValue(item(2, 0, null));
            const conn = fakeConn(rules());
            run(conn);
            await purchases.createPurchase(1, { lines: [{ itemId: 2, quantity: 4, unitCost: 500 }], supplierId: 3, amountPaid: 0 });
            expect(conn.writes(/INSERT INTO stock_payments/)).toHaveLength(0);
            expect(conn.writes(/UPDATE stock_items SET cost_price/)[0].params[0]).toBe(500);
        });

        it("chains the average when the same item is on two lines", async () => {
            const t = item(2, 10, 100);
            ledger.lockByItem.mockResolvedValue(t);
            ledger.applyDelta.mockImplementation(async (c, target, d) => { target.stock += d; return {}; });
            const conn = fakeConn(rules());
            run(conn);
            await purchases.createPurchase(1, { lines: [{ itemId: 2, quantity: 10, unitCost: 200 }, { itemId: 2, quantity: 20, unitCost: 300 }] });
            const costs = conn.writes(/UPDATE stock_items SET cost_price/).map((c) => c.params[0]);
            // 10 on hand at 100 + 10 at 200 -> 150 (20 on hand); then 20 on hand at 150 + 20 at 300 -> 225
            expect(costs).toEqual([150, 225]);
        });

        it("refuses overpaying, a missing supplier and bad lines", async () => {
            ledger.lockByItem.mockResolvedValue(item(2, 1, 1));
            run(fakeConn(rules()));
            await expect(purchases.createPurchase(1, { lines: [{ itemId: 2, quantity: 1, unitCost: 100 }], amountPaid: 500 })).rejects.toThrow(/more than/);
            run(fakeConn(rules([[/FROM stock_suppliers WHERE id/, [[]]]])));
            await expect(purchases.createPurchase(1, { lines: [{ itemId: 2, quantity: 1, unitCost: 100 }], supplierId: 99 })).rejects.toMatchObject({ statusCode: 404 });
            await expect(purchases.createPurchase(1, { lines: [] })).rejects.toThrow(/at least one/);
            await expect(purchases.createPurchase(1, { lines: [{ itemId: 2, quantity: 1 }] })).rejects.toThrow(/Unit cost/);
        });

        it("replays by request id", async () => {
            run(fakeConn([[/FROM purchases WHERE seller_id = \? AND idempotency_key/, [[{ id: 61, payload_hash: null }]]]]));
            const out = await purchases.createPurchase(1, { lines: [{ itemId: 2, quantity: 1, unitCost: 100 }], idempotencyKey: "abcdefgh12" });
            expect(out.replayed).toBe(true);
            expect(ledger.applyDelta).not.toHaveBeenCalled();
        });

        it("sends a back-in-stock alert for a restocked marketplace product, after commit", async () => {
            const listed = {
                kind: "product", stock: 0, product: { id: 3, name: "Kitenge", slug: "kitenge" }, variant: null,
                item: { id: 8, seller_id: 1, source: "nexora", product_id: 3, name: "Kitenge", cost_price: null, is_archived: 0 }
            };
            ledger.lockByItem.mockResolvedValue(listed);
            ledger.applyDelta.mockImplementation(async (c, target, d) => { target.stock += d; return {}; });
            run(fakeConn(rules()));
            await purchases.createPurchase(1, { lines: [{ itemId: 8, quantity: 5, unitCost: 100 }] });
            expect(alerts.checkAndNotifyStockChange).toHaveBeenCalledWith(expect.objectContaining({ id: 3, stock: 5 }), 0);
        });
    });

    describe("payPurchase", () => {
        const rules = (row, existing = []) => [
            [/FROM purchases WHERE id = \? AND seller_id = \? FOR UPDATE/, [[row]]],
            [/FROM stock_payments WHERE seller_id = \? AND batch_key/, [existing]],
            [/UPDATE purchases SET paid_amount/, [{}]],
            [/INSERT INTO stock_payments/, [{ insertId: 1 }]]
        ];
        let get;
        beforeEach(() => { get = jest.spyOn(purchases, "getPurchase").mockResolvedValue({ id: 50 }); });
        afterEach(() => get.mockRestore());

        it("records a part-payment and refuses more than is owed", async () => {
            const conn = fakeConn(rules({ id: 50, supplier_id: 3, total_amount: "5000", paid_amount: "1000" }));
            run(conn);
            await purchases.payPurchase(1, 50, { amount: 2500, method: "bank_transfer" });
            expect(conn.writes(/UPDATE purchases SET paid_amount/)[0].params).toEqual([2500, 50]);
            expect(conn.writes(/INSERT INTO stock_payments/)[0].params.slice(0, 4)).toEqual([1, "out", 2500, "bank_transfer"]);

            run(fakeConn(rules({ id: 50, supplier_id: 3, total_amount: "5000", paid_amount: "1000" })));
            await expect(purchases.payPurchase(1, 50, { amount: 4500 })).rejects.toMatchObject({ statusCode: 409 });
            run(fakeConn(rules({ id: 50, supplier_id: 3, total_amount: "5000", paid_amount: "5000" })));
            await expect(purchases.payPurchase(1, 50, { amount: 1 })).rejects.toThrow(/already paid/);
            run(fakeConn(rules(undefined)));
            await expect(purchases.payPurchase(1, 50, { amount: 1 })).rejects.toMatchObject({ statusCode: 404 });
        });
    });
});
