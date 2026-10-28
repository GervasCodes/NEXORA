jest.mock("../../../src/config/db", () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock("../../../src/modules/stock/stock.ledger", () => {
    const actual = jest.requireActual("../../../src/modules/stock/stock.ledger");
    return { ...actual, withTransaction: jest.fn(), lockByItem: jest.fn(), applyDelta: jest.fn() };
});
jest.mock("../../../src/modules/stock/stock.service", () => ({ syncListingItems: jest.fn().mockResolvedValue(0) }));
jest.mock("../../../src/modules/settings/settings.service", () => ({ getStockBackdateMaxDays: jest.fn().mockResolvedValue(7) }));
jest.mock("../../../src/modules/audit/audit.service", () => ({ log: jest.fn() }));

const ledger = require("../../../src/modules/stock/stock.ledger");
const audit = require("../../../src/modules/audit/audit.service");
const sales = require("../../../src/modules/stock/sales.service");
const { fakeConn } = require("../../helpers/fakeConn");

const target = (id, over = {}) => ({
    kind: "item", product: null, variant: null, stock: 10,
    item: { id, seller_id: 1, source: "external", product_id: null, name: `Item ${id}`, sell_price: 1000, cost_price: 600, is_archived: 0 },
    ...over
});

const saleRules = (overrides = []) => [
    ...overrides,
    [/FROM sales WHERE seller_id = \? AND idempotency_key/, [[]]],
    [/FROM stock_customers WHERE id/, [[{ id: 5, name: "Asha" }]]],
    [/INSERT INTO stock_counters/, [{}]],
    [/SELECT LAST_INSERT_ID/, [[{ n: 7 }]]],
    [/INSERT INTO sales/, [{ insertId: 100 }]],
    [/INSERT INTO sale_lines/, [{}]],
    [/INSERT INTO stock_payments/, [{ insertId: 1 }]]
];

const run = (conn) => ledger.withTransaction.mockImplementation(async (work) => work(conn));

describe("sales.service", () => {
    let getSale;
    beforeEach(() => {
        jest.clearAllMocks();
        ledger.applyDelta.mockResolvedValue({});
        getSale = jest.spyOn(sales, "getSale").mockResolvedValue({ id: 100, receipt_no: "R000007" });
    });
    afterEach(() => getSale.mockRestore());

    describe("createSale", () => {
        const items = { 2: target(2), 5: target(5, { stock: 4, item: { ...target(5).item, sell_price: 2500, cost_price: null } }) };
        beforeEach(() => ledger.lockByItem.mockImplementation(async (c, s, id) => items[id]));

        it("prices lines, applies the discount, takes stock per line and records the money", async () => {
            const conn = fakeConn(saleRules());
            run(conn);
            const out = await sales.createSale(1, {
                lines: [{ itemId: 5, quantity: 2 }, { itemId: 2, quantity: 3, unitPrice: 900 }],
                discount: 500, paymentMethod: "mobile_money"
            });
            expect(out.replayed).toBe(false);

            const insert = conn.writes(/INSERT INTO sales/)[0].params;
            // subtotal 2*2500 + 3*900 = 7700; total 7200; paid in full for a non-credit sale
            expect(insert).toEqual(expect.arrayContaining([7700, 500, 7200]));
            expect(insert.filter((p) => p === 7200)).toHaveLength(2); // total and paid

            // stock: one 'sale' ledger row per line, negative, referencing the sale
            expect(ledger.applyDelta).toHaveBeenCalledTimes(2);
            const deltas = ledger.applyDelta.mock.calls.map((c) => [c[1], c[2], c[3].type, c[3].refType, c[3].refId]);
            expect(deltas).toContainEqual([items[5], -2, "sale", "sale", 100]);
            expect(deltas).toContainEqual([items[2], -3, "sale", "sale", 100]);

            const pay = conn.writes(/INSERT INTO stock_payments/)[0].params;
            expect(pay.slice(0, 4)).toEqual([1, "in", 7200, "mobile_money"]);
        });

        it("snapshots the cost on the line (null when the item has no cost yet)", async () => {
            const conn = fakeConn(saleRules());
            run(conn);
            await sales.createSale(1, { lines: [{ itemId: 2, quantity: 1 }, { itemId: 5, quantity: 1 }] });
            const rows = conn.writes(/INSERT INTO sale_lines/)[0].params[0];
            const byItem = Object.fromEntries(rows.map((r) => [r[2], r[8]]));
            expect(byItem).toEqual({ 2: 600, 5: null });
        });

        it("locks items in ascending id order whatever order the lines come in", async () => {
            run(fakeConn(saleRules()));
            await sales.createSale(1, { lines: [{ itemId: 5, quantity: 1 }, { itemId: 2, quantity: 1 }, { itemId: 5, quantity: 1 }] });
            expect(ledger.lockByItem.mock.calls.map((c) => c[2])).toEqual([2, 5]);
        });

        it("uses the discounted price of a Nexora listing", async () => {
            const listed = target(8, {
                kind: "product", stock: 5, product: { id: 3, name: "Kitenge", price: 20000, discount_price: 15000 },
                item: { ...target(8).item, source: "nexora", product_id: 3, name: "Kitenge" }
            });
            ledger.lockByItem.mockResolvedValue(listed);
            const conn = fakeConn(saleRules());
            run(conn);
            await sales.createSale(1, { lines: [{ itemId: 8, quantity: 2 }] });
            expect(conn.writes(/INSERT INTO sales/)[0].params).toContain(30000);
            expect(conn.writes(/INSERT INTO sale_lines/)[0].params[0][0][5]).toBe("nexora");
        });

        it("refuses a discount bigger than the sale", async () => {
            run(fakeConn(saleRules()));
            await expect(sales.createSale(1, { lines: [{ itemId: 2, quantity: 1 }], discount: 1001 })).rejects.toThrow(/discount/i);
        });

        it("refuses an archived item", async () => {
            ledger.lockByItem.mockResolvedValue(target(2, { item: { ...target(2).item, is_archived: 1 } }));
            run(fakeConn(saleRules()));
            await expect(sales.createSale(1, { lines: [{ itemId: 2, quantity: 1 }] })).rejects.toMatchObject({ statusCode: 409 });
        });

        it("lets the stock ledger refuse an oversell (the whole sale rolls back)", async () => {
            ledger.applyDelta.mockRejectedValue(Object.assign(new Error("Not enough stock - only 4 in stock."), { statusCode: 409 }));
            run(fakeConn(saleRules()));
            await expect(sales.createSale(1, { lines: [{ itemId: 5, quantity: 9 }] })).rejects.toMatchObject({ statusCode: 409 });
        });

        describe("credit", () => {
            it("needs a customer when something is left owing", async () => {
                run(fakeConn(saleRules()));
                await expect(sales.createSale(1, { lines: [{ itemId: 2, quantity: 1 }], paymentMethod: "credit" }))
                    .rejects.toThrow(/customer/i);
            });
            it("records a part-payment against a customer and keeps the rest as a balance", async () => {
                const conn = fakeConn(saleRules());
                run(conn);
                await sales.createSale(1, { lines: [{ itemId: 2, quantity: 4 }], paymentMethod: "credit", customerId: 5, amountPaid: 1500, paidVia: "cash" });
                const insert = conn.writes(/INSERT INTO sales/)[0].params;
                expect(insert).toEqual(expect.arrayContaining([4000, 1500, "credit", "Asha"]));
                expect(conn.writes(/INSERT INTO stock_payments/)[0].params.slice(0, 4)).toEqual([1, "in", 1500, "cash"]);
            });
            it("takes no payment row when nothing was paid", async () => {
                const conn = fakeConn(saleRules());
                run(conn);
                await sales.createSale(1, { lines: [{ itemId: 2, quantity: 1 }], paymentMethod: "credit", customerId: 5 });
                expect(conn.writes(/INSERT INTO stock_payments/)).toHaveLength(0);
            });
            it("refuses paying more than the total", async () => {
                run(fakeConn(saleRules()));
                await expect(sales.createSale(1, { lines: [{ itemId: 2, quantity: 1 }], paymentMethod: "credit", customerId: 5, amountPaid: 5000 }))
                    .rejects.toThrow(/more than/);
            });
            it("404s for a customer that isn't this seller's", async () => {
                run(fakeConn(saleRules([[/FROM stock_customers WHERE id/, [[]]]])));
                await expect(sales.createSale(1, { lines: [{ itemId: 2, quantity: 1 }], paymentMethod: "credit", customerId: 99 }))
                    .rejects.toMatchObject({ statusCode: 404 });
            });
        });

        describe("idempotency", () => {
            it("replays an earlier sale with the same key without moving stock", async () => {
                const conn = fakeConn([[/FROM sales WHERE seller_id = \? AND idempotency_key/, [[{ id: 77, payload_hash: null }]]]]);
                run(conn);
                const out = await sales.createSale(1, { lines: [{ itemId: 2, quantity: 1 }], idempotencyKey: "abcdefgh12" });
                expect(out.replayed).toBe(true);
                expect(ledger.applyDelta).not.toHaveBeenCalled();
                expect(getSale).toHaveBeenCalledWith(1, 77);
            });
            it("refuses the same key with a different body", async () => {
                run(fakeConn([[/FROM sales WHERE seller_id = \? AND idempotency_key/, [[{ id: 77, payload_hash: "different" }]]]]));
                await expect(sales.createSale(1, { lines: [{ itemId: 2, quantity: 1 }], idempotencyKey: "abcdefgh12" }))
                    .rejects.toMatchObject({ statusCode: 409 });
            });
            it("treats a duplicate-key error from a parallel request as a replay", async () => {
                ledger.withTransaction.mockRejectedValue(Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" }));
                const db = require("../../../src/config/db");
                db.query.mockResolvedValueOnce([[{ id: 55 }]]);
                const out = await sales.createSale(1, { lines: [{ itemId: 2, quantity: 1 }], idempotencyKey: "abcdefgh12" });
                expect(out.replayed).toBe(true);
                expect(getSale).toHaveBeenCalledWith(1, 55);
            });
        });

        describe("dates", () => {
            it("refuses a sale dated beyond the back-dating window and one in the future", async () => {
                run(fakeConn(saleRules()));
                const old = new Date(Date.now() - 30 * 86400000).toISOString();
                await expect(sales.createSale(1, { lines: [{ itemId: 2, quantity: 1 }], soldAt: old })).rejects.toThrow(/in the past/);
                const future = new Date(Date.now() + 3600000).toISOString();
                await expect(sales.createSale(1, { lines: [{ itemId: 2, quantity: 1 }], soldAt: future })).rejects.toThrow(/future/);
            });
            it("flags and audits a back-dated sale", async () => {
                const conn = fakeConn(saleRules());
                run(conn);
                const twoDays = new Date(Date.now() - 2 * 86400000).toISOString();
                await sales.createSale(1, { lines: [{ itemId: 2, quantity: 1 }], soldAt: twoDays }, { createdBy: 9 });
                expect(conn.writes(/INSERT INTO sales/)[0].params).toContain(1); // is_backdated
                expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "stock.sale_backdated", userId: 9 }));
            });
        });

        it("validates the lines", async () => {
            await expect(sales.createSale(1, { lines: [] })).rejects.toThrow(/at least one/);
            await expect(sales.createSale(1, { lines: [{ itemId: 2, quantity: 0 }] })).rejects.toThrow(/whole number/);
            await expect(sales.createSale(1, { lines: [{ itemId: 2, quantity: 1 }], paymentMethod: "barter" })).rejects.toThrow(/paying/);
        });
    });

    describe("voidSale", () => {
        const sale = (over = {}) => ({ id: 100, seller_id: 1, receipt_no: "R000007", source: "pos", voided_at: null, paid_amount: "4000", payment_method: "cash", customer_id: null, ...over });
        const rules = (saleRow, lines) => [
            [/FROM sales WHERE id = \? AND seller_id = \? FOR UPDATE/, [[saleRow]]],
            [/FROM sale_lines WHERE sale_id = \? ORDER BY id FOR UPDATE/, [lines]],
            [/INSERT INTO stock_payments/, [{ insertId: 1 }]],
            [/UPDATE sales SET voided_at/, [{}]]
        ];
        const line = (id, item, qty, returned = 0, cost = 600) => ({ id, stock_item_id: item, quantity: qty, returned_quantity: returned, unit_cost: cost });

        beforeEach(() => ledger.lockByItem.mockImplementation(async (c, s, id) => target(id)));

        it("puts back only what has not already been returned, refunds the money and marks it cancelled", async () => {
            const conn = fakeConn(rules(sale(), [line(1, 5, 3, 1), line(2, 2, 2)]));
            run(conn);
            await sales.voidSale(1, 100, { reason: "Wrong item" }, { createdBy: 9 });

            const deltas = ledger.applyDelta.mock.calls.map((c) => [c[1].item.id, c[2], c[3].type]);
            expect(deltas).toEqual(expect.arrayContaining([[5, 2, "void"], [2, 2, "void"]]));
            expect(ledger.applyDelta.mock.calls.every((c) => c[3].refType === "sale" && c[3].refId === 100)).toBe(true);

            expect(conn.writes(/INSERT INTO stock_payments/)[0].params.slice(0, 4)).toEqual([1, "out", 4000, "cash"]);
            expect(conn.writes(/UPDATE sales SET voided_at/)[0].params).toEqual([9, "Wrong item", 100]);
            expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "stock.sale_voided" }));
        });

        it("skips a line whose units were all returned, and a sale with nothing paid has no refund row", async () => {
            const conn = fakeConn(rules(sale({ paid_amount: "0" }), [line(1, 5, 2, 2)]));
            run(conn);
            await sales.voidSale(1, 100, { reason: "Mistake" });
            expect(ledger.applyDelta).not.toHaveBeenCalled();
            expect(conn.writes(/INSERT INTO stock_payments/)).toHaveLength(0);
        });

        it("needs a reason, 404s on another seller's sale, and refuses repeats and legacy rows", async () => {
            await expect(sales.voidSale(1, 100, { reason: " " })).rejects.toThrow(/reason/);
            run(fakeConn(rules(undefined, [])));
            await expect(sales.voidSale(1, 100, { reason: "Mistake" })).rejects.toMatchObject({ statusCode: 404 });
            run(fakeConn(rules(sale({ voided_at: new Date() }), [])));
            await expect(sales.voidSale(1, 100, { reason: "Mistake" })).rejects.toMatchObject({ statusCode: 409 });
            run(fakeConn(rules(sale({ source: "legacy" }), [])));
            await expect(sales.voidSale(1, 100, { reason: "Mistake" })).rejects.toMatchObject({ statusCode: 409 });
            expect(ledger.applyDelta).not.toHaveBeenCalled();
        });
    });

    describe("returnSale", () => {
        const sale = (over = {}) => ({
            id: 100, seller_id: 1, receipt_no: "R000007", source: "pos", voided_at: null, subtotal: "10000", discount_amount: "1000",
            total_amount: "9000", paid_amount: "9000", returned_amount: "0", payment_method: "cash", customer_id: null, ...over
        });
        const L = (id, item, qty, price, returned = 0) => ({ id, stock_item_id: item, item_name: `Item ${item}`, quantity: qty, returned_quantity: returned, unit_price: price, unit_cost: 600 });
        const rules = (saleRow, lines) => [
            [/FROM sales WHERE id = \? AND seller_id = \? FOR UPDATE/, [[saleRow]]],
            [/FROM sale_lines WHERE sale_id = \? ORDER BY id FOR UPDATE/, [lines]],
            [/INSERT INTO sale_returns/, [{ insertId: 11 }]],
            [/INSERT INTO sale_return_lines/, [{}]],
            [/UPDATE sale_lines SET returned_quantity/, [{}]],
            [/UPDATE sales SET returned_amount/, [{}]],
            [/INSERT INTO stock_payments/, [{ insertId: 1 }]]
        ];
        beforeEach(() => ledger.lockByItem.mockImplementation(async (c, s, id) => target(id)));

        it("restocks, values the goods net of the sale discount and refunds what was already paid", async () => {
            // 10 000 of goods, 1 000 discount -> each unit of a 5 000 line is worth 4 500
            const conn = fakeConn(rules(sale(), [L(1, 2, 1, 5000), L(2, 5, 1, 5000)]));
            run(conn);
            await sales.returnSale(1, 100, { lines: [{ saleLineId: 1, quantity: 1 }], reason: "Too small" }, { createdBy: 9 });

            expect(ledger.applyDelta).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ item: expect.objectContaining({ id: 2 }) }), 1, expect.objectContaining({ type: "return", refId: 100 }));
            const ret = conn.writes(/INSERT INTO sale_returns/)[0].params;
            expect(ret.slice(0, 5)).toEqual([1, 100, 4500, 4500, 0]); // amount, refund, credit
            expect(conn.writes(/UPDATE sales SET returned_amount/)[0].params).toEqual([4500, 4500, 100]);
            expect(conn.writes(/INSERT INTO stock_payments/)[0].params.slice(0, 4)).toEqual([1, "out", 4500, "cash"]);
            expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "stock.sale_returned" }));
        });

        it("on a credit sale the return first cancels what is still owed, and only the excess is refunded", async () => {
            // total 9 000, paid 2 000 -> owes 7 000. Return worth 4 500: all credited, nothing refunded.
            const conn = fakeConn(rules(sale({ paid_amount: "2000", payment_method: "credit", customer_id: 5 }), [L(1, 2, 1, 5000), L(2, 5, 1, 5000)]));
            run(conn);
            await sales.returnSale(1, 100, { lines: [{ saleLineId: 1, quantity: 1 }] });
            expect(conn.writes(/INSERT INTO sale_returns/)[0].params.slice(2, 5)).toEqual([4500, 0, 4500]);
            expect(conn.writes(/UPDATE sales SET returned_amount/)[0].params).toEqual([4500, 2000, 100]);
            expect(conn.writes(/INSERT INTO stock_payments/)).toHaveLength(0);
        });

        it("returning everything settles to exactly the sale total (no rounding left behind)", async () => {
            const lines = [L(1, 2, 3, 3333.33)];
            const conn = fakeConn(rules(sale({ subtotal: "9999.99", discount_amount: "999.99", total_amount: "9000", paid_amount: "9000" }), lines));
            run(conn);
            await sales.returnSale(1, 100, { lines: [{ saleLineId: 1, quantity: 3 }] });
            expect(conn.writes(/UPDATE sales SET returned_amount/)[0].params).toEqual([9000, 0, 100]);
        });

        it("refuses returning more than is left, a foreign line, a cancelled or legacy sale", async () => {
            run(fakeConn(rules(sale(), [L(1, 2, 2, 5000, 1)])));
            await expect(sales.returnSale(1, 100, { lines: [{ saleLineId: 1, quantity: 2 }] })).rejects.toMatchObject({ statusCode: 409 });
            await expect(sales.returnSale(1, 100, { lines: [{ saleLineId: 99, quantity: 1 }] })).rejects.toMatchObject({ statusCode: 404 });
            run(fakeConn(rules(sale({ voided_at: new Date() }), [])));
            await expect(sales.returnSale(1, 100, { lines: [{ saleLineId: 1, quantity: 1 }] })).rejects.toMatchObject({ statusCode: 409 });
            run(fakeConn(rules(sale({ source: "legacy" }), [])));
            await expect(sales.returnSale(1, 100, { lines: [{ saleLineId: 1, quantity: 1 }] })).rejects.toMatchObject({ statusCode: 409 });
            await expect(sales.returnSale(1, 100, { lines: [] })).rejects.toThrow(/what is being returned/);
            expect(ledger.applyDelta).not.toHaveBeenCalled();
        });
    });

    describe("listSales", () => {
        it("turns Dar es Salaam dates into UTC bounds and scopes to the seller", async () => {
            const db = require("../../../src/config/db");
            db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ sales: 0, net_total: 0, owed: 0 }]]);
            await sales.listSales(7, { from: "2026-10-27", to: "2026-10-27", status: "active" });
            const [sql, params] = db.query.mock.calls[0];
            expect(sql).toMatch(/s\.seller_id = \?/);
            expect(sql).toMatch(/s\.voided_at IS NULL/);
            expect(params[0]).toBe(7);
            expect(params[1].toISOString()).toBe("2026-10-26T21:00:00.000Z");
            expect(params[2].toISOString()).toBe("2026-10-27T21:00:00.000Z");
        });
    });
});
