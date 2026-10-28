const trade = require("../../../src/modules/stock/stock.trade");
const { fakeConn } = require("../../helpers/fakeConn");

describe("stock.trade", () => {
    describe("money", () => {
        it("rounds to cents and refuses negatives, NaN and absurd values", () => {
            expect(trade.money("12.345")).toBe(12.35);
            expect(trade.money(0)).toBe(0);
            expect(() => trade.money(-1)).toThrow(/zero or more/);
            expect(() => trade.money("abc")).toThrow();
            expect(() => trade.money(undefined)).toThrow();
            expect(() => trade.money(2e9)).toThrow();
        });
    });

    describe("dates (Africa/Dar_es_Salaam)", () => {
        it("a Dar es Salaam day starts at 21:00 UTC the evening before", () => {
            expect(trade.dayStart("2026-10-27").toISOString()).toBe("2026-10-26T21:00:00.000Z");
            expect(trade.dayAfter("2026-10-27").toISOString()).toBe("2026-10-27T21:00:00.000Z");
        });
        it("rejects malformed dates", () => {
            expect(() => trade.dayStart("27/10/2026")).toThrow();
        });
    });

    describe("resolveWhen", () => {
        const now = new Date("2026-10-27T10:00:00Z");
        it("uses the server clock when nothing is sent", () => {
            expect(trade.resolveWhen(undefined, 7, now)).toEqual({ date: now, isBackdated: false });
        });
        it("accepts a few minutes of clock skew and a recent time without flagging it", () => {
            const r = trade.resolveWhen("2026-10-27T09:55:00Z", 7, now);
            expect(r.isBackdated).toBe(false);
            expect(() => trade.resolveWhen("2026-10-27T10:03:00Z", 7, now)).not.toThrow();
        });
        it("refuses the future", () => {
            expect(() => trade.resolveWhen("2026-10-27T11:00:00Z", 7, now)).toThrow(/future/);
        });
        it("flags an earlier time as back-dated, and refuses one older than the window", () => {
            expect(trade.resolveWhen("2026-10-25T10:00:00Z", 7, now).isBackdated).toBe(true);
            expect(() => trade.resolveWhen("2026-10-01T10:00:00Z", 7, now)).toThrow(/7 days/);
            expect(() => trade.resolveWhen("2026-10-26T09:00:00Z", 0, now)).toThrow(/0 days/);
            expect(() => trade.resolveWhen("nonsense", 7, now)).toThrow(/Invalid date/);
        });
    });

    describe("nextNumber", () => {
        it("bumps the counter atomically and formats a padded receipt number", async () => {
            const conn = fakeConn([
                [/INSERT INTO stock_counters/, [{}]],
                [/SELECT LAST_INSERT_ID/, [[{ n: 42 }]]]
            ]);
            expect(await trade.nextNumber(conn, 9, "sale")).toBe("R000042");
            expect(conn.calls[0].sql).toMatch(/LAST_INSERT_ID\(counter_value \+ 1\)/);
            expect(conn.calls[0].params).toEqual([9, "sale"]);
            expect(await trade.nextNumber(conn, 9, "purchase")).toBe("P000042");
        });
    });

    describe("balanceOf", () => {
        it("is total - returned - paid and never negative", () => {
            expect(trade.balanceOf({ total_amount: "10000", returned_amount: "2000", paid_amount: "3000" })).toBe(5000);
            expect(trade.balanceOf({ total_amount: "10000", returned_amount: "10000", paid_amount: "0" })).toBe(0);
            expect(trade.balanceOf({ total_amount: "100", returned_amount: "0", paid_amount: "150" })).toBe(0);
        });
    });

    describe("insertPayment", () => {
        it("skips a zero amount and writes the rest", async () => {
            const conn = fakeConn([[/INSERT INTO stock_payments/, [{ insertId: 3 }]]]);
            expect(await trade.insertPayment(conn, { sellerId: 1, direction: "in", amount: 0, kind: "sale" })).toBeNull();
            expect(conn.calls).toHaveLength(0);
            expect(await trade.insertPayment(conn, { sellerId: 1, direction: "in", amount: 5000, kind: "sale", method: "cash" })).toBe(3);
        });
    });
});
