import { describe, it, expect } from "vitest";
import { computeFunding } from "../../src/utils/sponsorshipCredits";

const pricing = (remaining, { paid_enabled = true, daily_rate = 5000 } = {}) => ({
    daily_rate,
    paid_enabled,
    included_credits: { granted: 10, used: 10 - remaining, remaining, period_end: null }
});

describe("computeFunding", () => {
    it("spends included credits first and prices only the remaining days", () => {
        expect(computeFunding(pricing(3), 7)).toEqual({
            creditDays: 3, paidDays: 4, totalCost: 20000, remainingCredits: 3, blocked: false
        });
    });

    it("costs nothing when credits cover every day", () => {
        expect(computeFunding(pricing(10), 4)).toMatchObject({ creditDays: 4, paidDays: 0, totalCost: 0, blocked: false });
    });

    it("is the plain paid price when the seller has no credits left", () => {
        expect(computeFunding(pricing(0), 5)).toMatchObject({ creditDays: 0, paidDays: 5, totalCost: 25000, blocked: false });
    });

    it("still allows a credit-only campaign when paid purchases are disabled", () => {
        expect(computeFunding(pricing(4, { paid_enabled: false }), 4)).toMatchObject({ paidDays: 0, blocked: false });
    });

    it("blocks the form when paid purchases are disabled and credits don't cover every day", () => {
        expect(computeFunding(pricing(2, { paid_enabled: false }), 5)).toMatchObject({
            creditDays: 2, paidDays: 3, blocked: true
        });
    });

    it("treats missing pricing/credits data as zero credits rather than throwing", () => {
        expect(computeFunding({ daily_rate: 5000, paid_enabled: true }, 2)).toMatchObject({
            creditDays: 0, paidDays: 2, totalCost: 10000
        });
        expect(computeFunding(null, 2)).toMatchObject({ creditDays: 0, totalCost: 0 });
    });

    it("ignores an empty or invalid duration", () => {
        expect(computeFunding(pricing(3), "")).toMatchObject({ creditDays: 0, paidDays: 0, totalCost: 0, blocked: false });
    });
});
