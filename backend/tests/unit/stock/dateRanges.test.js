jest.mock("../../../src/config/db", () => ({ query: jest.fn() }));
const trade = require("../../../src/modules/stock/stock.trade");
const pos = require("../../../src/modules/pos/pos.service");

describe("report ranges are Africa/Dar_es_Salaam days", () => {
    // 22:30 UTC on 27 Oct is 01:30 on 28 Oct in Dar es Salaam - the case the old UTC code got wrong.
    const lateUtc = new Date("2026-10-27T22:30:00Z");

    it("'today' follows the Dar es Salaam calendar, not UTC", () => {
        expect(trade.today(lateUtc)).toBe("2026-10-28");
        expect(trade.today(new Date("2026-10-27T20:59:00Z"))).toBe("2026-10-27");
    });

    it("resolveRange defaults to the last 30 days ending today, as UTC+3 instants", () => {
        const r = trade.resolveRange({}, { now: lateUtc });
        expect(r.to).toBe("2026-10-28");
        expect(r.from).toBe("2026-09-29");
        expect(r.days).toHaveLength(30);
        expect(r.start.toISOString()).toBe("2026-09-28T21:00:00.000Z");
        expect(r.endExclusive.toISOString()).toBe("2026-10-28T21:00:00.000Z");
    });

    it("a sale at 23:30 UTC belongs to the NEXT Dar es Salaam day", () => {
        const r = trade.resolveRange({ from: "2026-10-28", to: "2026-10-28" });
        const sale = new Date("2026-10-27T23:30:00Z");
        expect(sale >= r.start && sale < r.endExclusive).toBe(true);
        const before = trade.resolveRange({ from: "2026-10-27", to: "2026-10-27" });
        expect(sale >= before.start && sale < before.endExclusive).toBe(false);
    });

    it("rejects reversed, malformed and over-long ranges", () => {
        expect(() => trade.resolveRange({ from: "2026-10-05", to: "2026-10-03" })).toThrow(/on or after/);
        expect(() => trade.resolveRange({ from: "10/05/2026" })).toThrow();
        expect(() => trade.resolveRange({ from: "2024-01-01", to: "2026-01-01" })).toThrow(/one year/);
    });

    it("the classic POS report uses the same Dar es Salaam day bounds", () => {
        const r = pos.resolveReportRange({ from: "2026-10-28", to: "2026-10-28" });
        expect(r.start.toISOString()).toBe("2026-10-27T21:00:00.000Z");
        expect(r.endExclusive.toISOString()).toBe("2026-10-28T21:00:00.000Z");
        expect(() => pos.resolveReportRange({ from: "2026-10-05", to: "2026-10-03" })).toThrow();
    });

    it("day labels in SQL are shifted to UTC+3, independent of the database zone", () => {
        expect(trade.darDaySql("o.created_at")).toMatch(/10800 - TIMESTAMPDIFF\(SECOND, UTC_TIMESTAMP\(\), NOW\(\)\)/);
        expect(trade.darDaySql("s.sold_at", "datetime")).toMatch(/INTERVAL -?\d+ SECOND/);
    });
});
