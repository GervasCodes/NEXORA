jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/sponsorshipCredit/sponsorshipCredit.repository");
jest.mock("../../../src/modules/settings/settings.service");

const db = require("../../../src/config/db");
const creditRepository = require("../../../src/modules/sponsorshipCredit/sponsorshipCredit.repository");
const settingsService = require("../../../src/modules/settings/settings.service");

const creditService = require("../../../src/modules/sponsorshipCredit/sponsorshipCredit.service");

const connection = db.__mockConnection;

beforeEach(() => {
    jest.clearAllMocks();
    creditRepository.incrementUsed.mockResolvedValue(true);
});

describe("sponsorshipCredit.service.computeGrantForPlan", () => {
    it("grants the plan's monthly allotment for a monthly billing cycle", () => {
        expect(creditService.computeGrantForPlan({ sponsorship_credits_per_month: 10, billing_cycle: "monthly" })).toBe(10);
    });

    it("grants twelve months' worth up front for an annual billing cycle", () => {
        expect(creditService.computeGrantForPlan({ sponsorship_credits_per_month: 10, billing_cycle: "annual" })).toBe(120);
    });

    it("treats a missing, null, or negative allotment as zero", () => {
        expect(creditService.computeGrantForPlan({ billing_cycle: "monthly" })).toBe(0);
        expect(creditService.computeGrantForPlan({ sponsorship_credits_per_month: null, billing_cycle: "monthly" })).toBe(0);
        expect(creditService.computeGrantForPlan({ sponsorship_credits_per_month: -5, billing_cycle: "monthly" })).toBe(0);
    });
});

describe("sponsorshipCredit.service.grantForSubscription", () => {
    const subscription = {
        id: 5, seller_id: 10,
        current_period_start: "2026-09-01 00:00:00", current_period_end: "2026-10-01 00:00:00"
    };

    it("records one period row for the subscription with the plan's full allotment, in the caller's transaction", async () => {
        await creditService.grantForSubscription(
            { subscription, plan: { sponsorship_credits_per_month: 3, billing_cycle: "monthly" } },
            connection
        );

        expect(creditRepository.insertPeriodIfAbsent).toHaveBeenCalledWith({
            sellerId: 10,
            subscriptionId: 5,
            creditsGranted: 3,
            periodStart: "2026-09-01 00:00:00",
            periodEnd: "2026-10-01 00:00:00"
        }, connection);
    });

    it("refuses to grant for a subscription that has no billing period yet", async () => {
        await expect(
            creditService.grantForSubscription(
                { subscription: { id: 5, seller_id: 10 }, plan: { sponsorship_credits_per_month: 3, billing_cycle: "monthly" } },
                connection
            )
        ).rejects.toThrow("without a billing period");

        expect(creditRepository.insertPeriodIfAbsent).not.toHaveBeenCalled();
    });
});

describe("sponsorshipCredit.service.splitFunding", () => {
    it("spends included credits first, then charges the daily rate for the remaining days", () => {
        expect(creditService.splitFunding({ days: 7, dailyRate: 5000, creditsAvailable: 3, paidEnabled: true }))
            .toEqual({ creditDays: 3, paidDays: 4, totalCost: 20000 });
    });

    it("covers the whole campaign from credits when there are enough, charging nothing", () => {
        expect(creditService.splitFunding({ days: 4, dailyRate: 5000, creditsAvailable: 10, paidEnabled: true }))
            .toEqual({ creditDays: 4, paidDays: 0, totalCost: 0 });
    });

    it("is entirely the paid flow, unchanged, when the seller has no credits", () => {
        expect(creditService.splitFunding({ days: 5, dailyRate: 5000, creditsAvailable: 0, paidEnabled: true }))
            .toEqual({ creditDays: 0, paidDays: 5, totalCost: 25000 });
    });

    it("still allows a credit-only campaign when paid sponsorship is disabled", () => {
        expect(creditService.splitFunding({ days: 4, dailyRate: 5000, creditsAvailable: 4, paidEnabled: false }))
            .toEqual({ creditDays: 4, paidDays: 0, totalCost: 0 });
    });

    it("rejects a paid remainder when paid sponsorship is disabled and there are no credits", () => {
        expect(() => creditService.splitFunding({ days: 4, dailyRate: 5000, creditsAvailable: 0, paidEnabled: false }))
            .toThrow("no included sponsorship credits left");
    });

    it("rejects a paid remainder when paid sponsorship is disabled and credits only partly cover it", () => {
        expect(() => creditService.splitFunding({ days: 4, dailyRate: 5000, creditsAvailable: 1, paidEnabled: false }))
            .toThrow("you have 1 day of included credits left");
    });

    it("prices only the paid days, at the given daily rate, to two decimals", () => {
        expect(creditService.splitFunding({ days: 4, dailyRate: 333.33, creditsAvailable: 1, paidEnabled: true }).totalCost)
            .toBe(999.99);
    });
});

describe("sponsorshipCredit.service.planFunding", () => {
    it("locks the seller's current period row and reports the remaining balance, without consuming anything", async () => {
        creditRepository.findCurrentPeriodId.mockResolvedValue(3);
        creditRepository.findByIdForUpdate.mockResolvedValue({ id: 3, credits_granted: 5, credits_used: 2 });

        const funding = await creditService.planFunding(10, { days: 6, dailyRate: 1000, paidEnabled: true }, connection);

        expect(creditRepository.findCurrentPeriodId).toHaveBeenCalledWith(10, connection);
        expect(creditRepository.findByIdForUpdate).toHaveBeenCalledWith(3, connection);
        expect(funding).toEqual({ creditDays: 3, paidDays: 3, totalCost: 3000, periodId: 3 });
        expect(creditRepository.incrementUsed).not.toHaveBeenCalled();
    });

    it("treats a seller with no current credit period as having zero credits", async () => {
        creditRepository.findCurrentPeriodId.mockResolvedValue(null);

        const funding = await creditService.planFunding(10, { days: 2, dailyRate: 1000, paidEnabled: true }, connection);

        expect(funding).toEqual({ creditDays: 0, paidDays: 2, totalCost: 2000, periodId: null });
        expect(creditRepository.findByIdForUpdate).not.toHaveBeenCalled();
    });
});

describe("sponsorshipCredit.service.consumeCredits", () => {
    it("applies a guarded increment inside the caller's transaction", async () => {
        await creditService.consumeCredits(3, 4, connection);

        expect(creditRepository.incrementUsed).toHaveBeenCalledWith(3, 4, connection);
    });

    it("does nothing for zero credits", async () => {
        await creditService.consumeCredits(3, 0, connection);
        await creditService.consumeCredits(null, 0, connection);

        expect(creditRepository.incrementUsed).not.toHaveBeenCalled();
    });

    it("throws instead of overspending when the guarded increment is refused", async () => {
        creditRepository.incrementUsed.mockResolvedValue(false);

        await expect(creditService.consumeCredits(3, 4, connection)).rejects.toThrow(
            "Not enough included sponsorship credits remaining"
        );
    });
});

describe("sponsorshipCredit.service.getSummary / getPricingContext", () => {
    it("returns zeros with no period end for a seller who was never granted credits", async () => {
        creditRepository.findCurrentPeriodId.mockResolvedValue(null);

        await expect(creditService.getSummary(10)).resolves.toEqual({
            granted: 0, used: 0, remaining: 0, period_end: null
        });
    });

    it("never reports a negative remaining balance", async () => {
        creditRepository.findCurrentPeriodId.mockResolvedValue(3);
        creditRepository.findById.mockResolvedValue({ id: 3, credits_granted: 2, credits_used: 5, period_end: "2026-10-01" });

        const summary = await creditService.getSummary(10);

        expect(summary.remaining).toBe(0);
    });

    it("combines the summary with the paid-purchases flag for the seller-facing pricing response", async () => {
        settingsService.isSponsorshipMonetizationEnabled.mockResolvedValue(false);
        creditRepository.findCurrentPeriodId.mockResolvedValue(3);
        creditRepository.findById.mockResolvedValue({ id: 3, credits_granted: 10, credits_used: 1, period_end: "2026-10-01" });

        await expect(creditService.getPricingContext(10)).resolves.toEqual({
            paid_enabled: false,
            included_credits: { granted: 10, used: 1, remaining: 9, period_end: "2026-10-01" }
        });
    });
});
