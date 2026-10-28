import { describe, it, expect } from "vitest";
import { daysAgoDar, todayDar } from "../../src/utils/darDate";

describe("darDate", () => {
    it("today is the Tanzania date even when UTC is still the day before", () => {
        // 22:30 UTC on 27 Oct = 01:30 on 28 Oct in Dar es Salaam
        expect(todayDar(new Date("2026-10-27T22:30:00Z"))).toBe("2026-10-28");
        expect(todayDar(new Date("2026-10-27T20:59:00Z"))).toBe("2026-10-27");
    });
    it("counts back in calendar days across month and year ends", () => {
        const now = new Date("2026-03-02T10:00:00Z");
        expect(daysAgoDar(0, now)).toBe("2026-03-02");
        expect(daysAgoDar(29, now)).toBe("2026-02-01"); // 2 Mar minus 29 days (February 2026 has 28)
        expect(daysAgoDar(30, now)).toBe("2026-01-31");
        expect(daysAgoDar(2, new Date("2027-01-01T00:30:00+03:00"))).toBe("2026-12-30");
    });
});
