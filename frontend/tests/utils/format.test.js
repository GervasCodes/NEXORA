import { describe, it, expect } from "vitest";
import { formatMoney, formatDate, formatShortDate } from "../../src/utils/format";

describe("formatMoney", () => {
    it("formats a whole number with the TZS prefix and thousands separators", () => {
        expect(formatMoney(1500000)).toBe("TZS 1,500,000");
    });

    it("rounds to the nearest whole unit (no decimals)", () => {
        expect(formatMoney(999.6)).toBe("TZS 1,000");
    });

    it("treats null/undefined/NaN as zero rather than throwing", () => {
        expect(formatMoney(null)).toBe("TZS 0");
        expect(formatMoney(undefined)).toBe("TZS 0");
        expect(formatMoney("not a number")).toBe("TZS 0");
    });

    it("formats zero correctly", () => {
        expect(formatMoney(0)).toBe("TZS 0");
    });
});

describe("formatDate", () => {
    it("formats an ISO date string as 'D Mon YYYY'", () => {
        expect(formatDate("2026-03-05T12:00:00Z")).toBe("5 Mar 2026");
    });
});

describe("formatShortDate", () => {
    it("formats an ISO date string as 'D Mon' with no year", () => {
        expect(formatShortDate("2026-03-05T12:00:00Z")).toBe("5 Mar");
    });
});
