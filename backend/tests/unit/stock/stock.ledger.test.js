jest.mock("../../../src/config/db", () => ({ query: jest.fn(), getConnection: jest.fn() }));

const ledger = require("../../../src/modules/stock/stock.ledger");

const makeConn = (handler = () => [{ insertId: 1 }]) => {
    const conn = { query: jest.fn(async (sql, params) => handler(sql, params)) };
    return conn;
};

describe("stock.ledger", () => {
    describe("hashPayload", () => {
        it("is stable regardless of key order and changes with the values", () => {
            expect(ledger.hashPayload({ a: 1, b: 2 })).toBe(ledger.hashPayload({ b: 2, a: 1 }));
            expect(ledger.hashPayload({ a: 1 })).not.toBe(ledger.hashPayload({ a: 2 }));
        });
    });

    describe("applyDelta", () => {
        const target = () => ({ kind: "product", product: { id: 5 }, variant: null, item: { id: 3, seller_id: 1 }, stock: 10 });

        it("applies a relative delta and writes a ledger row with before/after", async () => {
            const conn = makeConn();
            const t = target();
            const result = await ledger.applyDelta(conn, t, -4, { type: "sale", refType: "offline_sale", refId: 9 });

            expect(result).toMatchObject({ stockBefore: 10, stockAfter: 6, quantityChange: -4 });
            expect(conn.query.mock.calls[0][0]).toMatch(/UPDATE products SET stock = stock \+ \?/);
            expect(conn.query.mock.calls[0][1]).toEqual([-4, 5]);
            expect(conn.query.mock.calls[1][0]).toMatch(/INSERT INTO stock_movements/);
            expect(t.stock).toBe(6);
        });

        it("writes to the variant or the external item when that holds the number", async () => {
            const conn = makeConn();
            await ledger.applyDelta(conn, { kind: "variant", product: { id: 5 }, variant: { id: 8 }, item: { id: 3, seller_id: 1 }, stock: 2 }, 1, { type: "purchase" });
            expect(conn.query.mock.calls[0][0]).toMatch(/UPDATE product_variants/);
            await ledger.applyDelta(conn, { kind: "item", item: { id: 4, seller_id: 1 }, stock: 2 }, 1, { type: "purchase" });
            expect(conn.query.mock.calls[2][0]).toMatch(/UPDATE stock_items/);
        });

        it("refuses to go negative unless explicitly allowed", async () => {
            const conn = makeConn();
            await expect(ledger.applyDelta(conn, target(), -11, { type: "sale" })).rejects.toThrow(/Not enough stock/);
            expect(conn.query).not.toHaveBeenCalled();
            await expect(ledger.applyDelta(conn, target(), -11, { type: "sale", allowNegative: true })).resolves.toBeTruthy();
        });
    });

    describe("setStock", () => {
        it("applies only the seller's own change when a baseline is given", async () => {
            // The form showed 10, the seller wants 12, but 3 were sold meanwhile (now 7).
            const conn = makeConn();
            const result = await ledger.setStock(conn, { kind: "item", item: { id: 1, seller_id: 1 }, stock: 7 }, 12, { baseline: 10 });
            expect(result.quantityChange).toBe(2);
            expect(result.stockAfter).toBe(9);
        });

        it("is a no-op when nothing changes and rejects bad numbers", async () => {
            const conn = makeConn();
            expect(await ledger.setStock(conn, { kind: "item", item: { id: 1, seller_id: 1 }, stock: 7 }, 7)).toBeNull();
            await expect(ledger.setStock(conn, { kind: "item", item: { id: 1, seller_id: 1 }, stock: 7 }, -1)).rejects.toThrow();
            await expect(ledger.setStock(conn, { kind: "item", item: { id: 1, seller_id: 1 }, stock: 7 }, 1.5)).rejects.toThrow();
        });

        it("refuses when the seller's change would push live stock below zero", async () => {
            const conn = makeConn();
            await expect(
                ledger.setStock(conn, { kind: "item", item: { id: 1, seller_id: 1 }, stock: 1 }, 0, { baseline: 10 })
            ).rejects.toThrow(/Not enough stock/);
        });
    });

    describe("checkIdempotency", () => {
        it("returns null without a key, replays the same body, refuses a different body", async () => {
            const conn = makeConn(() => [[{ id: 1, payload_hash: "aaa" }]]);
            expect(await ledger.checkIdempotency(conn, 1, null, "x")).toBeNull();
            expect((await ledger.checkIdempotency(conn, 1, "key-12345", "aaa")).id).toBe(1);
            await expect(ledger.checkIdempotency(conn, 1, "key-12345", "bbb")).rejects.toMatchObject({ statusCode: 409 });
        });
    });

    describe("recordOrderMovements", () => {
        it("chains before/after across several rows of the same listing (deduct)", async () => {
            const conn = makeConn((sql) => {
                if (sql.includes("FROM stock_items WHERE link_key IN")) return [[{ id: 7, link_key: "5-0" }]];
                if (sql.includes("FROM products WHERE id IN")) return [[{ id: 5, seller_id: 1, name: "A", price: 10, stock: 5 }]];
                return [{ insertId: 1 }];
            });
            await ledger.recordOrderMovements(conn, [
                { order_id: 11, seller_id: 1, product_id: 5, variant_id: null, quantity: 2 },
                { order_id: 12, seller_id: 1, product_id: 5, variant_id: 0, quantity: 1 }
            ], "order_deduct");

            const insert = conn.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO stock_movements"));
            const rows = insert[1][0];
            expect(rows[0].slice(3, 6)).toEqual([-2, 8, 6]);
            expect(rows[1].slice(3, 6)).toEqual([-1, 6, 5]);
            expect(rows[0][6]).toBe("order");
            expect(rows[0][7]).toBe(11);
        });

        it("creates the item with an opening balance when the listing had none (restore)", async () => {
            let created = false;
            const conn = makeConn((sql) => {
                if (sql.includes("FROM stock_items WHERE link_key IN")) return [[]];
                if (sql.startsWith("INSERT IGNORE INTO stock_items")) { created = true; return [{}]; }
                if (sql.includes("FROM stock_items WHERE link_key = ?")) return [created ? [{ id: 20, link_key: "5-0" }] : []];
                if (sql.includes("FROM products WHERE id IN")) return [[{ id: 5, seller_id: 1, name: "A", price: 10, stock: 6 }]];
                return [{ insertId: 1 }];
            });
            await ledger.recordOrderMovements(conn, [{ order_id: 11, seller_id: 1, product_id: 5, variant_id: null, quantity: 2 }], "order_restore");

            const opening = conn.query.mock.calls.find(([sql]) => sql.includes("'opening'"));
            expect(opening[1][2]).toBe(4);
            const movement = conn.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO stock_movements") && !sql.includes("'opening'"));
            expect(movement[1][0][0].slice(3, 6)).toEqual([2, 4, 6]);
        });

        it("does nothing for an empty list", async () => {
            const conn = makeConn();
            await ledger.recordOrderMovements(conn, [], "order_deduct");
            expect(conn.query).not.toHaveBeenCalled();
        });
    });
});
