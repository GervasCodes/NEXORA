import { describe, it, expect } from "vitest";
import { computeFunding } from "../../src/utils/sponsorshipCredits";

const pricing = (remaining, { daily_rate = 5000 } = {}) => ({
    daily_rate,
    paid_enabled: true,
    included_credits: { granted: 10, used: 10 - remaining, remaining, period_end: null }
});

describe("computeFunding", () => {
    it("spends included credits first and prices only the remaining days", () => {
        expect(computeFunding(pricing(3), 7)).toEqual({
            creditDays: 3, paidDays: 4, totalCost: 20000, remainingCredits: 3
        });
    });

    it("costs nothing when credits cover every day", () => {
        expect(computeFunding(pricing(10), 4)).toMatchObject({ creditDays: 4, paidDays: 0, totalCost: 0 });
    });

    it("is the plain paid price when the seller has no credits left", () => {
        expect(computeFunding(pricing(0), 5)).toMatchObject({ creditDays: 0, paidDays: 5, totalCost: 25000 });
    });

    it("treats missing pricing/credits data as zero credits rather than throwing", () => {
        expect(computeFunding({ daily_rate: 5000, paid_enabled: true }, 2)).toMatchObject({
            creditDays: 0, paidDays: 2, totalCost: 10000
        });
        expect(computeFunding(null, 2)).toMatchObject({ creditDays: 0, totalCost: 0 });
    });

    it("ignores an empty or invalid duration", () => {
        expect(computeFunding(pricing(3), "")).toMatchObject({ creditDays: 0, paidDays: 0, totalCost: 0 });
    });
});
