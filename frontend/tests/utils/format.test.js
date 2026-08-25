import { describe, it, expect, afterEach } from "vitest";
import { formatMoney, formatDate, formatShortDate, formatDateTime, formatMonthYear, setFormatLocale } from "../../src/utils/format";

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

// Phase 1 (Remediation, E4): formatDate/formatShortDate/formatDateTime/
// formatMonthYear used to always format via "en-GB" regardless of the
// user's chosen language. setFormatLocale is how LanguageContext keeps
// them in sync - these tests guard the mapping itself.
describe("setFormatLocale", () => {
    afterEach(() => {
        // Reset to the default so this suite doesn't leak locale state
        // into other test files.
        setFormatLocale("en");
    });

    it("maps 'sw' to the sw-TZ locale for date formatting", () => {
        setFormatLocale("sw");
        expect(formatDate("2026-03-05T12:00:00Z")).toBe(
            new Date("2026-03-05T12:00:00Z").toLocaleDateString("sw-TZ", {
                day: "numeric",
                month: "short",
                year: "numeric"
            })
        );
    });

    it("keeps en-GB formatting for 'en' and any other/unset language", () => {
        setFormatLocale("en");
        expect(formatDate("2026-03-05T12:00:00Z")).toBe("5 Mar 2026");
        expect(formatShortDate("2026-03-05T12:00:00Z")).toBe("5 Mar");

        setFormatLocale("fr");
        expect(formatDate("2026-03-05T12:00:00Z")).toBe("5 Mar 2026");
    });

    it("applies the active locale to formatDateTime and formatMonthYear too", () => {
        setFormatLocale("sw");
        expect(formatDateTime("2026-03-05T12:00:00Z")).toBe(
            new Date("2026-03-05T12:00:00Z").toLocaleString("sw-TZ", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            })
        );
        expect(formatMonthYear("2026-03-05T12:00:00Z")).toBe(
            new Date("2026-03-05T12:00:00Z").toLocaleDateString("sw-TZ", {
                month: "short",
                year: "numeric"
            })
        );
    });
});
